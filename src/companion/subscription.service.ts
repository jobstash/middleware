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

type MembershipRecord = {
  status: "pending" | "active" | "expired";
  paidUntil: Date | null;
  cancelledAt: Date | null;
  checkoutUrl: string;
};
export interface MembershipStatus {
  advanced: boolean;
  price: { amount: "9.99"; currency: "USD"; interval: "month" };
  subscription: MembershipRecord | null;
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
  ): Promise<CandidateSubscriptionState & { subscriptionId: string | null }> {
    const session = await this.stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["subscription.latest_invoice"] },
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
    if (session.status !== "complete" || !session.subscription)
      return {
        status: session.status === "expired" ? "expired" : "pending",
        paidUntil: null,
        cancelledAt: null,
        subscriptionId: null,
        billingState: session.status === "expired" ? "terminal" : "open",
      };
    const subscription =
      typeof session.subscription === "string"
        ? await this.stripe.subscriptions.retrieve(
            session.subscription,
            { expand: ["latest_invoice"] },
            { timeout: 12000, maxNetworkRetries: 0 },
          )
        : session.subscription;
    const priceId = this.config.get<string>("STRIPE_CANDIDATE_PRICE_ID");
    if (!priceId)
      throw new ServiceUnavailableException(
        "Candidate billing is not configured",
      );
    return {
      ...readStripeSubscription(subscription, priceId, owner),
      subscriptionId: subscription.id,
    };
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
          "UPDATE candidate_subscriptions SET status=$2,paid_until=$3,cancelled_at=$4,subscription_id=$5,billing_state=$6,reconciled_at=now() WHERE checkout_id=$1",
          [
            subscription.checkout_id,
            state.status,
            state.paidUntil,
            state.cancelledAt,
            state.subscriptionId,
            state.billingState,
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
      `SELECT CASE WHEN status='active' AND paid_until<=clock_timestamp() THEN 'expired' ELSE status END AS status,paid_until AS "paidUntil",cancelled_at AS "cancelledAt",checkout_url AS "checkoutUrl" FROM candidate_subscriptions WHERE user_node_id=$1 ORDER BY (status='active' AND paid_until>clock_timestamp()) DESC,created_at DESC LIMIT 1`,
      [owner],
    );
    return {
      advanced: await this.entitled(owner),
      price: { amount: "9.99", currency: "USD", interval: "month" },
      subscription: subscription ?? null,
    };
  }

  async checkout(
    wallet: string,
    raw: unknown,
  ): Promise<{ checkoutUrl: string }> {
    const { requestId } = deviceInput("checkout", raw);
    const owner = await this.owner(wallet);
    const priceId = this.config.get<string>("STRIPE_CANDIDATE_PRICE_ID");
    if (!priceId)
      throw new ServiceUnavailableException(
        "Candidate billing is not configured",
      );
    const price = await this.stripe.prices.retrieve(
      priceId,
      {},
      { timeout: 12000, maxNetworkRetries: 0 },
    );
    if (
      !price.livemode ||
      !price.active ||
      price.currency !== "usd" ||
      price.unit_amount !== 999 ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw new ServiceUnavailableException(
        "Membership price must be live USD9.99 per month",
      );
    const origin = new URL(this.config.getOrThrow<string>("ORG_ADMIN_DOMAIN"));
    if (origin.origin !== "https://recruiters.rip")
      throw new ServiceUnavailableException("Invalid membership return origin");
    await this.refresh(owner);
    return this.db.transaction(async db => {
      await db.query(
        "SELECT id FROM graph_nodes WHERE id=$1 AND label='User' FOR UPDATE",
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
        "SELECT checkout_url,billing_state FROM candidate_subscriptions WHERE user_node_id=$1 AND request_id=$2",
        [owner, requestId],
      );
      if (prior?.billing_state === "open")
        return { checkoutUrl: prior.checkout_url };
      if (prior)
        throw new ConflictException(
          "Checkout request has expired; start a new checkout",
        );
      const [pending] = await db.query(
        "SELECT checkout_url FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_state='open' ORDER BY created_at DESC LIMIT 1",
        [owner],
      );
      if (pending) return { checkoutUrl: pending.checkout_url };
      const returnUrl = `${origin.origin}/onboarding/membership/return`;
      const metadata = { candidateId: owner, purpose: "recruiters-membership" };
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "subscription",
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
        "INSERT INTO candidate_subscriptions(checkout_id,user_node_id,request_id,checkout_url) VALUES($1,$2,$3,$4)",
        [session.id, owner, requestId, url.href],
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
        "UPDATE candidate_subscriptions SET status=$2,paid_until=$3,cancelled_at=$4,subscription_id=$5,billing_state=$6,reconciled_at=now() WHERE checkout_id=$1",
        [
          owned.checkout_id,
          state.status,
          state.paidUntil,
          state.cancelledAt,
          state.subscriptionId,
          state.billingState,
        ],
      );
    });
    return true;
  }
}
