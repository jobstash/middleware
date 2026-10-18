import { Interval } from "@nestjs/schedule";
import {
  BadRequestException, ConflictException, Inject, Injectable, Logger, Optional,
  ServiceUnavailableException, UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { CandidateCheckoutInput, CandidateBillingMutationInput } from "./career.dto";
import { candidateOrigin } from "./candidate-origin";
import {
  CANDIDATE_PRICES, CANDIDATE_STRIPE_PURPOSE, CandidateBillingInterval,
  CandidateStripeBinding, CandidateStripeState, candidateStripeState, stripeId,
  stripeTimestamp, validateCandidatePrice, validateCandidateSession,
} from "./stripe-candidate-subscription";

export const CANDIDATE_STRIPE_CLIENT = "CANDIDATE_STRIPE_CLIENT";
export interface CandidateCheckoutResult { checkoutUrl: string }
export interface CandidateCancellationResult {
  cancelAtPeriodEnd: true; paidUntil: string | null; cancelledAt: string | null;
}
export interface CandidateWebhookResult { received: boolean }
type SubscriptionRow = Record<string, unknown> & CandidateStripeBinding & {
  status: string; checkout_url: string; provider_event_at: Date | null; billing_provider: "stripe" | "legacy";
};
const subscriptionExpansion = ["items.data.price.product", "discounts", "items.data.discounts", "latest_invoice"];

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private reconciling = false;
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly config: ConfigService,
    @Optional() @Inject(CANDIDATE_STRIPE_CLIENT) private readonly stripe: Stripe | null = null,
  ) {}
  private client(): Stripe {
    if (!this.stripe) throw new ServiceUnavailableException("Candidate Stripe billing is not configured");
    return this.stripe;
  }
  async status(wallet: string): Promise<Record<string, unknown>> {
    const owner = await this.career.owner(wallet);
    const [row] = await this.db.query<SubscriptionRow>(
      `SELECT * FROM candidate_subscriptions WHERE user_node_id=$1
       ORDER BY (status='active' AND paid_until>now()) DESC,created_at DESC LIMIT 1`, [owner],
    );
    return {
      advanced: await this.career.entitled(owner),
      price: CANDIDATE_PRICES[row?.interval ?? "month"],
      prices: CANDIDATE_PRICES,
      subscription: row ? {
        status: row.status === "active" && (!row.paid_until || new Date(row.paid_until).getTime() <= Date.now()) ? "expired" : row.status,
        paidUntil: row.paid_until ? new Date(row.paid_until).toISOString() : null,
        cancelledAt: row.provider_state?.cancelledAt ?? null,
        checkoutUrl: row.checkout_url,
        interval: row.interval,
        provider: row.billing_provider,
        discount: row.provider_state?.discount ?? null,
      } : null,
    };
  }
  private async configuredPrices(): Promise<Record<CandidateBillingInterval, Stripe.Price>> {
    const month = this.config.get<string>("CANDIDATE_STRIPE_MONTHLY_PRICE_ID");
    const year = this.config.get<string>("CANDIDATE_STRIPE_YEARLY_PRICE_ID");
    if (!month || !year || month === year)
      throw new ServiceUnavailableException("Candidate Stripe prices are not configured");
    const client = this.client();
    const [monthly, yearly] = await Promise.all([
      client.prices.retrieve(month, { expand: ["product"] }),
      client.prices.retrieve(year, { expand: ["product"] }),
    ]);
    if (monthly.id !== month || yearly.id !== year ||
        validateCandidatePrice(monthly, "month") === validateCandidatePrice(yearly, "year"))
      throw new BadRequestException("Candidate monthly and yearly prices require separate products");
    return { month: monthly, year: yearly };
  }
  private async readSubscription(id: string): Promise<Stripe.Subscription> {
    const client = this.client();
    const subscription = await client.subscriptions.retrieve(id, { expand: subscriptionExpansion });
    const coupons = new Map<string, Stripe.Coupon>();
    for (const discounts of [subscription.discounts, ...subscription.items.data.map(item => item.discounts)]) {
      for (const discount of discounts) {
        if (typeof discount === "string" || !discount.coupon || discount.coupon.applies_to) continue;
        // Stripe omits applies_to unless explicitly expanded, even on an expanded discount.
        let coupon = coupons.get(discount.coupon.id);
        if (!coupon) {
          coupon = await client.coupons.retrieve(discount.coupon.id, { expand: ["applies_to"] });
          coupons.set(coupon.id, coupon);
        }
        discount.coupon = coupon;
      }
    }
    return subscription;
  }
  private async storeState(db: EntityManager, row: SubscriptionRow, state: CandidateStripeState,
    subscriptionId: string | null, occurredAt?: string): Promise<SubscriptionRow> {
    // Stripe cancellation cannot be undone by a delayed active snapshot or reconciliation.
    // This surface has no resume operation; a fresh checkout is required after expiry.
    const previous = row.provider_state;
    if (previous?.terminal) return row;
    if (previous?.cancelAtPeriodEnd) {
      state.cancelAtPeriodEnd = true;
      state.cancelledAt = previous.cancelledAt ?? state.cancelledAt;
      if (row.paid_until && state.paidUntil && new Date(row.paid_until).getTime() < Date.parse(state.paidUntil))
        state.paidUntil = new Date(row.paid_until).toISOString();
      if (state.status === "active" && (!state.paidUntil || Date.parse(state.paidUntil) <= Date.now())) state.status = "expired";
    }
    const [updated] = await db.query(
      `WITH updated AS (UPDATE candidate_subscriptions SET status=$2,paid_until=$3,provider_state=$4::jsonb,
       stripe_subscription_id=COALESCE(stripe_subscription_id,$5),provider_event_at=COALESCE($6::timestamptz,provider_event_at),
       reconciled_at=now(),reconcile_attempt_at=now(),reconcile_error=NULL WHERE charge_id=$1 RETURNING *)
       SELECT * FROM updated`,
      [row.charge_id, state.status, state.paidUntil, JSON.stringify(state), subscriptionId, occurredAt ?? null],
    );
    return updated;
  }
  private async synchronize(db: EntityManager, row: SubscriptionRow, prices: Record<CandidateBillingInterval, Stripe.Price>,
    occurredAt?: string, expectedSubscriptionId?: string, deleted = false): Promise<SubscriptionRow> {
    if (row.provider_state?.terminal) return row;
    if (row.stripe_price_id !== prices[row.interval]?.id)
      throw new BadRequestException("Candidate subscription configured price does not match checkout");
    const session = await this.client().checkout.sessions.retrieve(row.charge_id, { expand: ["line_items"] });
    validateCandidateSession(session, row);
    const subscriptionId = stripeId(session.subscription);
    if (expectedSubscriptionId && subscriptionId !== expectedSubscriptionId)
      throw new BadRequestException("Candidate event subscription does not match stored checkout");
    if (!subscriptionId) {
      if (!["open", "expired"].includes(session.status)) throw new BadRequestException("Candidate checkout subscription is missing");
      return this.storeState(db, row, {
        status: session.status === "expired" ? "expired" : "pending", paidUntil: null,
        stripeStatus: session.status, terminal: session.status === "expired", cancelAtPeriodEnd: false,
        cancelledAt: null, discount: null,
      }, null, occurredAt);
    }
    if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status))
      throw new BadRequestException("Candidate checkout payment is not complete");
    const subscription = await this.readSubscription(subscriptionId);
    if (subscription.id !== subscriptionId) throw new BadRequestException("Candidate Stripe subscription does not match checkout");
    const state = candidateStripeState(subscription, row);
    if (deleted) {
      // A signed deletion for this exact verified binding is terminal even if
      // a concurrent Stripe read still contains the preceding active snapshot.
      state.status = "expired";
      state.terminal = true;
      state.stripeStatus = "canceled";
    }
    return this.storeState(db, row, state, subscriptionId, occurredAt);
  }
  async checkout(wallet: string, input: CandidateCheckoutInput): Promise<CandidateCheckoutResult> {
    if (!["month", "year"].includes(input.interval)) throw new BadRequestException("Choose a monthly or yearly subscription");
    return this.career.mutate(wallet, "checkout", { ...input, revision: 0 }, async (db, owner) => {
      const prices = await this.configuredPrices();
      const rows = await db.query(
        `SELECT * FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_provider='stripe'
         AND COALESCE(provider_state->>'terminal','false')<>'true' ORDER BY created_at DESC FOR UPDATE`, [owner],
      ) as SubscriptionRow[];
      for (const existing of rows) {
        const current = await this.synchronize(db, existing, prices);
        if (current.stripe_subscription_id && !current.provider_state?.terminal)
          throw new ConflictException("A candidate subscription already exists. Manage or cancel it before opening another checkout.");
        if (current.status !== "pending") continue;
        if (current.interval === input.interval) return { checkoutUrl: current.checkout_url };
        // Only one open checkout survives interval changes, including across processes.
        await this.client().checkout.sessions.expire(current.charge_id);
        await this.storeState(db, current, { ...current.provider_state!, status: "expired", stripeStatus: "expired", terminal: true }, null);
      }
      if (await this.career.entitled(owner, db)) throw new ConflictException("Candidate membership is already active");
      const [previous] = await db.query(
        `SELECT stripe_customer_id FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_provider='stripe'
         ORDER BY created_at DESC LIMIT 1`, [owner],
      );
      const client = this.client();
      const customerId = previous?.stripe_customer_id ?? (await client.customers.create({
        metadata: { purpose: CANDIDATE_STRIPE_PURPOSE, candidateId: owner },
      }, { idempotencyKey: `candidate-customer:${owner}` })).id;
      if (!customerId) throw new ServiceUnavailableException("Candidate Stripe customer is unavailable");
      const customer = await client.customers.retrieve(customerId);
      if ("deleted" in customer || customer.metadata.purpose !== CANDIDATE_STRIPE_PURPOSE || customer.metadata.candidateId !== owner)
        throw new BadRequestException("Candidate Stripe customer owner does not match");
      const returnUrl = `${candidateOrigin(this.config)}/onboarding/membership/return`;
      const metadata: Stripe.MetadataParam = { purpose: CANDIDATE_STRIPE_PURPOSE, candidateId: owner,
        checkoutRequestId: input.requestId, interval: input.interval };
      const session = await client.checkout.sessions.create({
        mode: "subscription", customer: customerId, client_reference_id: owner,
        line_items: [{ price: prices[input.interval].id, quantity: 1 }],
        allow_promotion_codes: true, payment_method_collection: "if_required",
        metadata, subscription_data: { metadata }, success_url: returnUrl, cancel_url: returnUrl,
      }, { idempotencyKey: `candidate-checkout:${owner}:${input.requestId}` });
      let url: URL;
      try { url = new URL(session.url); } catch { throw new ServiceUnavailableException("Invalid Stripe checkout URL"); }
      if (url.origin !== "https://checkout.stripe.com" || url.username || url.password ||
          !session.id || session.mode !== "subscription" || stripeId(session.customer) !== customerId ||
          session.client_reference_id !== owner || !stripeTimestamp(session.expires_at))
        throw new ServiceUnavailableException("Invalid Stripe checkout response");
      await db.query(
        `INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,return_target,billing_provider,
         interval,checkout_request_id,stripe_customer_id,stripe_price_id,checkout_expires_at)
         VALUES($1,$2,$3,'recruiters','stripe',$4,$5,$6,$7,$8)`,
        [session.id, owner, url.href, input.interval, input.requestId, customerId, prices[input.interval].id, stripeTimestamp(session.expires_at)],
      );
      return { checkoutUrl: url.href };
    });
  }
  async cancel(wallet: string, input: CandidateBillingMutationInput): Promise<CandidateCancellationResult> {
    return this.career.mutate(wallet, "subscription_cancel", { ...input, revision: 0 }, async (db, owner) => {
      const [legacy] = await db.query(
        `SELECT charge_id FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_provider='legacy'
         AND status='active' AND paid_until>now() LIMIT 1`, [owner],
      );
      if (legacy) throw new ConflictException("Legacy membership must be cancelled with its original provider; contact support");
      const prices = await this.configuredPrices();
      const rows = await db.query(
        `SELECT * FROM candidate_subscriptions WHERE user_node_id=$1 AND billing_provider='stripe'
         ORDER BY (status='active' AND paid_until>now()) DESC,created_at DESC FOR UPDATE`, [owner],
      ) as SubscriptionRow[];
      let current: SubscriptionRow;
      for (const row of rows) {
        const synced = await this.synchronize(db, row, prices);
        if (synced.stripe_subscription_id) { current = synced; break; }
      }
      if (!current) throw new BadRequestException("No candidate subscription to cancel");
      if (!current.provider_state?.terminal && !current.provider_state?.cancelAtPeriodEnd) {
        await this.client().subscriptions.update(current.stripe_subscription_id, { cancel_at_period_end: true },
          { idempotencyKey: `candidate-cancel:${owner}:${input.requestId}` });
        // Never trust the mutation response or a client timestamp for paid access.
        const confirmed = await this.readSubscription(current.stripe_subscription_id);
        if (confirmed.id !== current.stripe_subscription_id || !confirmed.cancel_at_period_end)
          throw new ServiceUnavailableException("Stripe has not confirmed cancellation");
        current = await this.storeState(db, current, candidateStripeState(confirmed, current), confirmed.id);
      }
      return { cancelAtPeriodEnd: true,
        paidUntil: current.paid_until ? new Date(current.paid_until).toISOString() : null,
        cancelledAt: current.provider_state?.cancelledAt ?? null };
    });
  }
  async webhook(raw: Buffer, signature: string): Promise<CandidateWebhookResult> {
    const secret = this.config.get<string>("CANDIDATE_STRIPE_WEBHOOK_SECRET");
    if (!secret || !raw || raw.length > 1000000 || !signature) throw new UnauthorizedException("Invalid Stripe webhook signature");
    let event: Stripe.Event;
    try { event = this.client().webhooks.constructEvent(raw, signature, secret); }
    catch { throw new UnauthorizedException("Invalid Stripe webhook signature"); }
    if (!event.id || event.id.length > 200 || !stripeTimestamp(event.created) || !event.data?.object ||
        !("id" in event.data.object) || typeof event.data.object.id !== "string")
      throw new BadRequestException("Invalid Stripe event");
    const object = event.data.object;
    const sessionEvent = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type);
    const subscriptionEvent = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type);
    const invoiceEvent = ["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible"].includes(event.type);
    if (!sessionEvent && !subscriptionEvent && !invoiceEvent) return { received: true };
    // The signed Stripe event union is narrowed by its registered resource type here;
    // retrieved checkout/subscription fields are independently verified before access.
    const invoice = object as Stripe.Invoice;
    const subscription = object as Stripe.Subscription;
    const subscriptionId = subscriptionEvent ? object.id : invoiceEvent ? stripeId(invoice.parent?.subscription_details?.subscription) : null;
    const requestId = subscriptionEvent ? subscription.metadata?.checkoutRequestId : null;
    const candidateId = subscriptionEvent ? subscription.metadata?.candidateId : null;
    await this.db.transaction(async db => {
      const [row] = await db.query(
        `SELECT * FROM candidate_subscriptions WHERE billing_provider='stripe' AND
         (($1::text IS NOT NULL AND charge_id=$1) OR ($2::text IS NOT NULL AND stripe_subscription_id=$2)
         OR ($3::text IS NOT NULL AND checkout_request_id::text=$3 AND user_node_id::text=$4)) FOR UPDATE`,
        [sessionEvent ? object.id : null, subscriptionId, requestId ?? null, candidateId ?? null],
      ) as SubscriptionRow[];
      if (!row) return; // Shared recruiter/agency/customer events are never assigned from metadata.
      if (subscriptionId && row.stripe_subscription_id && subscriptionId !== row.stripe_subscription_id)
        throw new BadRequestException("Candidate event subscription does not match checkout");
      const [claimed] = await db.query(
        `INSERT INTO candidate_payment_events(id,charge_id,event_type,occurred_at) VALUES($1,$2,$3,$4)
         ON CONFLICT DO NOTHING RETURNING id`, [event.id, row.charge_id, event.type, stripeTimestamp(event.created)],
      );
      if (!claimed || row.provider_state?.terminal ||
          (event.type !== "customer.subscription.deleted" && row.provider_event_at &&
            event.created * 1000 < new Date(row.provider_event_at).getTime())) return;
      await this.synchronize(db, row, await this.configuredPrices(), stripeTimestamp(event.created),
        subscriptionId ?? undefined, event.type === "customer.subscription.deleted");
    });
    return { received: true };
  }
  @Interval(900000) async scheduledReconciliation(): Promise<void> {
    if (process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1") return;
    await this.reconcile().catch(() => undefined);
  }
  async reconcile(): Promise<void> {
    if (this.reconciling || !this.stripe) return;
    this.reconciling = true;
    try {
      const prices = await this.configuredPrices();
      const rows = await this.db.query<{ charge_id: string }>(
        `SELECT charge_id FROM candidate_subscriptions WHERE billing_provider='stripe'
         AND COALESCE(provider_state->>'terminal','false')<>'true'
         AND COALESCE(reconcile_attempt_at,reconciled_at,'epoch')<now()-interval '15 minutes'
         ORDER BY COALESCE(reconcile_attempt_at,reconciled_at,'epoch'),created_at LIMIT 100`,
      );
      for (const row of rows) {
        try {
          await this.db.transaction(async db => {
            const [locked] = await db.query("SELECT * FROM candidate_subscriptions WHERE charge_id=$1 FOR UPDATE", [row.charge_id]) as SubscriptionRow[];
            if (locked) await this.synchronize(db, locked, prices);
          });
        } catch {
          this.logger.warn("Candidate Stripe reconciliation failed; will retry");
          await this.db.query("UPDATE candidate_subscriptions SET reconcile_attempt_at=now(),reconcile_error='Stripe verification unavailable' WHERE charge_id=$1", [row.charge_id]);
        }
      }
    } finally { this.reconciling = false; }
  }
}
