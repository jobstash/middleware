import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PostgresService } from "src/postgres/postgres.service";
import { deviceInput } from "./device-execution.protocol";
import {
  CandidateSubscriptionState,
  readStripeSubscription,
} from "./stripe-subscription";

type BillingInterval = "month" | "year";
const membershipPrices = {
  month: { amount: "9.99", currency: "USD", interval: "month" },
  year: { amount: "95.90", currency: "USD", interval: "year" },
} as const;
const subscriptionExpansions = [
  "latest_invoice.discounts",
  "latest_invoice.lines.data.discounts",
  "discounts",
  "items.data.discounts",
];

type MembershipRecord = {
  status: "pending" | "active" | "expired";
  paidUntil: Date | null;
  cancelledAt: Date | null;
  checkoutUrl: string;
  interval: BillingInterval;
  provider: "stripe";
  discount: CandidateSubscriptionState["discount"];
};
export interface MembershipStatus {
  advanced: boolean;
  price: (typeof membershipPrices)[BillingInterval];
  prices: typeof membershipPrices;
  subscription: MembershipRecord | null;
}

export interface MembershipCancellation {
  cancelAtPeriodEnd: true;
  paidUntil: string | null;
  cancelledAt: string;
}

@Injectable()
export class SubscriptionService {
  private readonly refreshing = new Map<string, Promise<void>>();
  constructor(
    private readonly db: PostgresService,
    private readonly config: ConfigService,
    @Inject("STRIPE_CLIENT") private readonly stripe: Stripe,
  ) {}

  async owner(wallet: string): Promise<string> {
    if (typeof wallet !== "string" || !wallet)
      throw new ForbiddenException("Account required");
    const rows = await this.db.query<{ id: string }>(
      "SELECT id::text AS id FROM graph_nodes WHERE label='User' AND lower(properties->>'wallet')=lower($1)",
      [wallet],
    );
    if (rows.length !== 1)
      throw new ForbiddenException("A unique account is required");
    return rows[0].id;
  }

  private async liveState(
    sessionId: string,
    owner: string,
  ): Promise<CandidateSubscriptionState & {
    subscriptionId: string | null;
    boundPriceId: string;
    subscription?: Stripe.Subscription;
  }> {
    const session = await this.stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["line_items.data.price", "subscription.latest_invoice"] },
      { timeout: 12000, maxNetworkRetries: 0 },
    );
    if (
      !session.livemode ||
      session.mode !== "subscription" ||
      session.client_reference_id !== owner ||
      session.metadata?.candidateId !== owner ||
      session.metadata?.purpose !== "recruiters-membership"
    )
      throw new ServiceUnavailableException(
        "Checkout account binding does not match",
      );
    const lines = session.line_items;
    const line = lines?.data[0];
    const price = line?.price;
    const interval = price?.recurring?.interval;
    if (
      !lines || lines.has_more || lines.data.length !== 1 ||
      line?.quantity !== 1 || !price || price.currency !== "usd" ||
      price.recurring?.interval_count !== 1 ||
      !((interval === "month" && price.unit_amount === 999) ||
        (interval === "year" && price.unit_amount === 9590))
    )
      throw new ServiceUnavailableException("Checkout membership price does not match");
    if (session.status !== "complete" || !session.subscription)
      return {
        status: session.status === "expired" ? "expired" : "pending",
        paidUntil: null,
        cancelledAt: null,
        subscriptionId: null,
        billingState: session.status === "expired" ? "terminal" : "open",
        interval,
        discount: null,
        boundPriceId: price.id,
      };
    let subscription =
      typeof session.subscription === "string"
        ? await this.stripe.subscriptions.retrieve(
            session.subscription,
            { expand: subscriptionExpansions },
            { timeout: 12000, maxNetworkRetries: 0 },
          )
        : session.subscription;
    const invoice = subscription.latest_invoice;
    const discounts = [
      ...(subscription.discounts ?? []),
      ...subscription.items.data.flatMap(item => item.discounts ?? []),
      ...(invoice && typeof invoice !== "string"
        ? [...(invoice.discounts ?? []),
          ...invoice.lines.data.flatMap(value => value.discounts ?? [])]
        : []),
    ];
    if (discounts.some(discount => typeof discount === "string"))
      subscription = await this.stripe.subscriptions.retrieve(
        subscription.id,
        { expand: subscriptionExpansions },
        { timeout: 12000, maxNetworkRetries: 0 },
      );
    await this.hydrateCoupons(subscription);
    return {
      ...readStripeSubscription(subscription, price.id, owner),
      boundPriceId: price.id,
      subscriptionId: subscription.id,
      subscription,
    };
  }

  // Stripe leaves applies_to out of embedded coupons. Retrieve it explicitly
  // before the parser enforces candidate-product and finite-discount policy.
  private async hydrateCoupons(subscription: Stripe.Subscription): Promise<void> {
    const invoice = subscription.latest_invoice;
    const discounts = [
      ...(subscription.discounts ?? []),
      ...subscription.items.data.flatMap(item => item.discounts ?? []),
      ...(invoice && typeof invoice !== "string"
        ? [...(invoice.discounts ?? []),
          ...invoice.lines.data.flatMap(line => line.discounts ?? [])]
        : []),
    ];
    const coupons = new Map<string, Stripe.Coupon>();
    for (const discount of discounts) {
      if (typeof discount === "string")
        throw new ServiceUnavailableException("Membership discount evidence is unavailable");
      const id = discount.coupon?.id;
      if (!id)
        throw new ServiceUnavailableException("Membership coupon evidence is unavailable");
      let coupon = coupons.get(id);
      if (!coupon) {
        coupon = await this.stripe.coupons.retrieve(
          id, { expand: ["applies_to"] },
          { timeout: 12000, maxNetworkRetries: 0 },
        );
        coupons.set(id, coupon);
      }
      discount.coupon = coupon;
    }
  }

  // Only in-flight work is shared. No completed result or entitlement is cached.
  async refresh(owner: string): Promise<void> {
    const current = this.refreshing.get(owner);
    if (current !== undefined) return current;
    const work = this.refreshOwner(owner);
    this.refreshing.set(owner, work);
    try {
      await work;
    } finally {
      if (this.refreshing.get(owner) === work) this.refreshing.delete(owner);
    }
  }

  private async refreshOwner(owner: string): Promise<void> {
    const subscriptions = await this.db.query<{ checkout_id: string }>(
      "SELECT checkout_id FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_state<>'terminal' ORDER BY created_at DESC",
      [owner],
    );
    for (const subscription of subscriptions) {
      await this.db.transaction(async db => {
        const [row] = await db.query(
          "SELECT checkout_id,billing_state FROM candidate_subscriptions WHERE checkout_id=$1 AND user_node_id=$2 FOR UPDATE",
          [subscription.checkout_id, owner],
        );
        if (!row)
          throw new ForbiddenException("Subscription ownership changed");
        if (row.billing_state === "terminal") return;
        // Keep a short, finite set of live agreements ordered against webhooks.
        // Terminal history never needs a provider call or holds a SQL connection.
        const state = await this.liveState(subscription.checkout_id, owner);
        await db.query(
          "UPDATE candidate_subscriptions SET status=$2,paid_until=$3,cancelled_at=$4,subscription_id=$5,billing_state=$6,billing_interval=$7,discount=$8,reconciled_at=now() WHERE checkout_id=$1",
          [
            subscription.checkout_id,
            state.status,
            state.paidUntil,
            state.cancelledAt,
            state.subscriptionId,
            state.billingState,
            state.interval,
            state.discount,
          ],
        );
      });
    }
  }

  async entitled(owner: string): Promise<boolean> {
    const [row] = await this.db.query<{ active: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM candidate_subscriptions WHERE user_node_id=$1 AND status='active' AND paid_until>clock_timestamp()) AS active",
      [owner],
    );
    return row?.active === true;
  }

  async status(wallet: string): Promise<MembershipStatus> {
    const owner = await this.owner(wallet);
    await this.refresh(owner);
    const [subscription] = await this.db.query<MembershipRecord>(
      `SELECT CASE WHEN status='active' AND paid_until<=clock_timestamp() THEN 'expired' ELSE status END AS status,paid_until AS "paidUntil",cancelled_at AS "cancelledAt",checkout_url AS "checkoutUrl",billing_interval AS interval,'stripe' AS provider,discount FROM candidate_subscriptions WHERE user_node_id=$1 ORDER BY (status='active' AND paid_until>clock_timestamp()) DESC,created_at DESC LIMIT 1`,
      [owner],
    );
    return {
      advanced: await this.entitled(owner),
      price: membershipPrices[subscription?.interval ?? "month"],
      prices: membershipPrices,
      subscription: subscription ?? null,
    };
  }

  async cancel(wallet: string, raw: unknown): Promise<MembershipCancellation> {
    const { requestId } = deviceInput("cancel", raw);
    const owner = await this.owner(wallet);
    const requestKey = `recruiters-cancel:${owner}:${requestId.toLowerCase()}`;

    // Commit the request's target before contacting Stripe. A failed response or
    // database write must never let a retry target a replacement subscription.
    const checkoutId = await this.db.transaction(async db => {
      await db.query(
        "SELECT id FROM graph_nodes WHERE id=$1 AND label='User' FOR UPDATE",
        [owner],
      );
      const [prior] = await db.query(
        "SELECT checkout_id FROM candidate_payment_events WHERE id=$1 AND event_type='cancellation.requested'",
        [requestKey],
      );
      if (prior) return prior.checkout_id as string;
      const agreements = await db.query(
        "SELECT checkout_id FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_state IN ('agreement','unresolved') ORDER BY created_at DESC",
        [owner],
      );
      if (agreements.length !== 1)
        throw new ConflictException("A unique membership billing agreement is required");
      const target = agreements[0].checkout_id as string;
      await db.query(
        "INSERT INTO candidate_payment_events(id,checkout_id,event_type,occurred_at) VALUES($1,$2,'cancellation.requested',now())",
        [requestKey, target],
      );
      return target;
    });
    return this.db.transaction(async db => {
      // Use the subscription lock shared by status refresh and webhook writes.
      const [owned] = await db.query(
        "SELECT checkout_id FROM candidate_subscriptions WHERE checkout_id=$1 AND user_node_id=$2 FOR UPDATE",
        [checkoutId, owner],
      );
      if (!owned) throw new ForbiddenException("Subscription ownership changed");
      try {
        const before = await this.liveState(checkoutId, owner);
        const subscription = before.subscription;
        if (!subscription || before.billingState !== "agreement")
          throw new ConflictException("No renewable membership was found");
        const updated = subscription.cancel_at_period_end
          ? subscription
          : await this.stripe.subscriptions.update(
              subscription.id,
              { cancel_at_period_end: true, expand: subscriptionExpansions },
              {
                idempotencyKey: requestKey,
                timeout: 12000,
                maxNetworkRetries: 0,
              },
            );
        await this.hydrateCoupons(updated);
        const state = readStripeSubscription(updated, before.boundPriceId, owner);
        if (
          updated.id !== subscription.id ||
          updated.cancel_at_period_end !== true ||
          state.billingState !== "agreement" ||
          !state.cancelledAt ||
          state.status !== before.status ||
          state.paidUntil !== before.paidUntil
        )
          throw new ServiceUnavailableException("Membership cancellation was not confirmed");
        const response: MembershipCancellation = {
          cancelAtPeriodEnd: true,
          paidUntil: state.paidUntil,
          cancelledAt: state.cancelledAt,
        };
        await db.query(
          "UPDATE candidate_subscriptions SET status=$2,paid_until=$3,cancelled_at=$4,subscription_id=$5,billing_state=$6,billing_interval=$7,discount=$8,reconciled_at=now() WHERE checkout_id=$1",
          [checkoutId, state.status, state.paidUntil, state.cancelledAt, updated.id, state.billingState, state.interval, state.discount],
        );
        return response;
      } catch (error) {
        if (error instanceof ConflictException || error instanceof ServiceUnavailableException)
          throw error;
        throw new ServiceUnavailableException("Membership cancellation could not be confirmed. Retry the same request.");
      }
    });
  }

  async checkout(
    wallet: string,
    raw: unknown,
  ): Promise<{ checkoutUrl: string }> {
    const { requestId, interval } = deviceInput("checkout", raw);
    const owner = await this.owner(wallet);
    const priceId = this.config.get<string>(
      interval === "month" ? "STRIPE_CANDIDATE_PRICE_ID" : "STRIPE_CANDIDATE_YEARLY_PRICE_ID",
    );
    if (!priceId)
      throw new ServiceUnavailableException(
        "Candidate billing is not configured",
      );
    const price = await this.stripe.prices.retrieve(
      priceId,
      { expand: ["product"] },
      { timeout: 12000, maxNetworkRetries: 0 },
    );
    const product = price.product;
    if (
      !price.livemode ||
      !price.active ||
      price.currency !== "usd" ||
      price.unit_amount !== (interval === "month" ? 999 : 9590) ||
      price.recurring?.interval !== interval ||
      price.recurring.interval_count !== 1 ||
      typeof product === "string" || !("active" in product) ||
      !product.active || !product.livemode ||
      product.id !== `recruiters_rip_candidate_${interval}_v1` ||
      product.metadata?.purpose !== "recruiters-rip-candidate-v1"
    )
      throw new ServiceUnavailableException(
        "Membership price must match the live candidate USD plan",
      );
    const origin = new URL(
      this.config.getOrThrow<string>("RECRUITERS_PUBLIC_ORIGIN"),
    );
    if (origin.origin !== "https://recruiters.rip")
      throw new ServiceUnavailableException("Invalid membership return origin");
    await this.refresh(owner);
    return this.db.transaction(async db => {
      await db.query(
        "SELECT id FROM graph_nodes WHERE id=$1 AND label='User' FOR UPDATE",
        [owner],
      );
      // Order the agreement check against webhook/refresh transitions of open
      // sessions. Account locks alone do not protect subscription row writers.
      await db.query(
        "SELECT checkout_id FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_state<>'terminal' ORDER BY created_at DESC FOR UPDATE",
        [owner],
      );
      const [agreement] = await db.query(
        "SELECT checkout_id FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_state IN ('agreement','unresolved') LIMIT 1",
        [owner],
      );
      if (agreement)
        throw new ConflictException(
          "An existing membership billing agreement must be resolved before starting another. Update its payment method using your Stripe invoice link, or contact support to cancel it. No second subscription was created.",
        );
      const [prior] = await db.query(
        "SELECT checkout_url,billing_state,billing_interval FROM candidate_subscriptions WHERE user_node_id=$1 AND request_id=$2",
        [owner, requestId],
      );
      if (prior?.billing_state === "open" && prior.billing_interval === interval)
        return { checkoutUrl: prior.checkout_url };
      if (prior)
        throw new ConflictException(
          "Checkout request has expired or changed interval; start a new checkout",
        );
      const pending = await db.query(
        "SELECT checkout_id,checkout_url,billing_interval FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_state='open' ORDER BY created_at DESC FOR UPDATE",
        [owner],
      );
      const matching = pending.find(row => row.billing_interval === interval);
      if (matching) return { checkoutUrl: matching.checkout_url };
      for (const old of pending) {
        // Expiring an already-completed session fails at Stripe: do not create a
        // replacement until its newly established agreement is reconciled.
        const expired = await this.stripe.checkout.sessions.expire(
          old.checkout_id, {},
          { timeout: 12000, maxNetworkRetries: 0 },
        );
        if (expired.id !== old.checkout_id || !expired.livemode || expired.status !== "expired")
          throw new ServiceUnavailableException("Previous checkout expiration was not confirmed");
        await db.query(
          "UPDATE candidate_subscriptions SET status='expired',billing_state='terminal',reconciled_at=now() WHERE checkout_id=$1",
          [old.checkout_id],
        );
      }
      const returnUrl = `${origin.origin}/onboarding/membership/return`;
      const metadata = { candidateId: owner, purpose: "recruiters-membership" };
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "subscription",
          allow_promotion_codes: true,
          payment_method_collection: "if_required",
          client_reference_id: owner,
          metadata,
          subscription_data: { metadata },
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: returnUrl,
          cancel_url: returnUrl,
        },
        {
          idempotencyKey: `recruiters-membership:${owner}:${requestId}`,
          timeout: 12000,
          maxNetworkRetries: 0,
        },
      );
      if (!session.livemode || !session.url)
        throw new ServiceUnavailableException("Invalid live checkout response");
      const url = new URL(session.url);
      if (
        url.origin !== "https://checkout.stripe.com" ||
        url.username ||
        url.password
      )
        throw new ServiceUnavailableException("Invalid checkout URL");
      await db.query(
        "INSERT INTO candidate_subscriptions(checkout_id,user_node_id,request_id,checkout_url,billing_interval) VALUES($1,$2,$3,$4,$5)",
        [session.id, owner, requestId, url.href, interval],
      );
      return { checkoutUrl: url.href };
    });
  }

  /** Called only after the existing Stripe controller verifies the event signature. */
  async webhook(event: Stripe.Event): Promise<boolean> {
    const supported = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ];
    if (!supported.includes(event.type)) return false;
    const object = event.data.object;
    let subscriptionId: string | undefined;
    let checkoutId: string | undefined;
    if (object.object === "checkout.session") checkoutId = object.id;
    else if (object.object === "subscription") subscriptionId = object.id;
    else if (object.object === "invoice") {
      const subscription = object.parent?.subscription_details?.subscription;
      subscriptionId =
        typeof subscription === "string" ? subscription : subscription?.id;
    }
    const [owned] = await this.db.query<{
      checkout_id: string;
      user_node_id: string;
    }>(
      "SELECT checkout_id,user_node_id::text FROM candidate_subscriptions WHERE checkout_id=$1 OR subscription_id=$2",
      [checkoutId ?? null, subscriptionId ?? null],
    );
    if (!owned) {
      // Candidate subscription events can precede checkout completion. Do not
      // route them into organization billing; status recovers the bound session.
      return (
        (object.object === "subscription" ||
          object.object === "checkout.session") &&
        object.metadata?.purpose === "recruiters-membership"
      );
    }
    if (!event.livemode)
      throw new ForbiddenException(
        "Test payment events cannot grant membership",
      );
    await this.db.transaction(async db => {
      const [row] = await db.query(
        "SELECT checkout_id,billing_state FROM candidate_subscriptions WHERE checkout_id=$1 FOR UPDATE",
        [owned.checkout_id],
      );
      if (!row) throw new ForbiddenException("Subscription ownership changed");
      const [claimed] = await db.query(
        "INSERT INTO candidate_payment_events(id,checkout_id,event_type,occurred_at) VALUES($1,$2,$3,to_timestamp($4)) ON CONFLICT DO NOTHING RETURNING id",
        [event.id, owned.checkout_id, event.type, event.created],
      );
      if (!claimed || row.billing_state === "terminal") return;
      const state = await this.liveState(owned.checkout_id, owned.user_node_id);
      await db.query(
        "UPDATE candidate_subscriptions SET status=$2,paid_until=$3,cancelled_at=$4,subscription_id=$5,billing_state=$6,billing_interval=$7,discount=$8,reconciled_at=now() WHERE checkout_id=$1",
        [
          owned.checkout_id,
          state.status,
          state.paidUntil,
          state.cancelledAt,
          state.subscriptionId,
          state.billingState,
          state.interval,
          state.discount,
        ],
      );
    });
    return true;
  }
}
