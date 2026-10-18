import Stripe from "stripe";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { CANDIDATE_STRIPE_PURPOSE, CandidateBillingInterval } from "./stripe-candidate-subscription";

/** Synthetic transport only: the SDK can never reach Stripe or any network. */
export class CandidateStripeFixture {
  readonly requests: { method: string; path: string; body: URLSearchParams }[] = [];
  readonly sessions = new Map<string, Stripe.Checkout.Session>();
  readonly subscriptions = new Map<string, Stripe.Subscription>();
  readonly customers = new Map<string, Stripe.Customer>();
  readonly couponExpansions = new Map<string, Stripe.Coupon>();
  readonly prices: Record<CandidateBillingInterval, Stripe.Price>;
  readonly config = new ConfigService({
    CANDIDATE_STRIPE_MONTHLY_PRICE_ID: "price_candidate_month", CANDIDATE_STRIPE_YEARLY_PRICE_ID: "price_candidate_year",
    CANDIDATE_STRIPE_WEBHOOK_SECRET: "whsec_candidate_synthetic", RECRUITERS_PUBLIC_ORIGIN: "https://recruiters.test",
  });
  readonly stripe: Stripe;
  constructor() {
    this.prices = Object.fromEntries((["month", "year"] as const).map(interval => [interval, {
      id: `price_candidate_${interval}`, object: "price", active: true, type: "recurring", currency: "usd",
      unit_amount: interval === "month" ? 999 : 9590, billing_scheme: "per_unit", transform_quantity: null,
      recurring: { interval, interval_count: 1, usage_type: "licensed" },
      product: { id: `candidate_product_${interval}`, object: "product", active: true, metadata: { purpose: CANDIDATE_STRIPE_PURPOSE } },
    }])) as unknown as Record<CandidateBillingInterval, Stripe.Price>;
    this.stripe = new Stripe("sk_test_candidate_synthetic", {
      maxNetworkRetries: 0,
      httpClient: Stripe.createFetchHttpClient(async (input, init) => {
        const path = new URL(String(input)).pathname;
        const method = init?.method ?? "GET";
        const body = new URLSearchParams(String(init?.body ?? ""));
        this.requests.push({ method, path, body });
        let value: unknown;
        const segments = path.split("/");
        if (path.startsWith("/v1/prices/")) {
          value = Object.values(this.prices).find(price => price.id === segments[3]);
        } else if (path === "/v1/customers" && method === "POST") {
          const customer = { id: `cus_candidate_${this.customers.size + 1}`, object: "customer",
            metadata: { purpose: body.get("metadata[purpose]"), candidateId: body.get("metadata[candidateId]") } } as unknown as Stripe.Customer;
          this.customers.set(customer.id, customer); value = customer;
        } else if (path.startsWith("/v1/customers/")) {
          value = this.customers.get(segments[3]);
        } else if (path === "/v1/checkout/sessions" && method === "POST") {
          const id = `cs_test_candidate_${this.sessions.size + 1}`;
          const price = Object.values(this.prices).find(item => item.id === body.get("line_items[0][price]"));
          const session = {
            id, object: "checkout.session", mode: "subscription", status: "open", payment_status: "unpaid", currency: "usd",
            url: `https://checkout.stripe.com/c/pay/${id}`, customer: body.get("customer"), client_reference_id: body.get("client_reference_id"),
            subscription: null, expires_at: Math.floor(Date.now() / 1000) + 86400,
            metadata: Object.fromEntries(["purpose", "candidateId", "checkoutRequestId", "interval"].map(key => [key, body.get(`metadata[${key}]`)])),
            line_items: { data: [{ id: `li_${id}`, quantity: 1, price }], has_more: false },
          } as unknown as Stripe.Checkout.Session;
          this.sessions.set(id, session); value = session;
        } else if (path.startsWith("/v1/checkout/sessions/")) {
          const session = this.sessions.get(segments[4]);
          if (segments[5] === "expire" && session) session.status = "expired";
          value = session;
        } else if (path.startsWith("/v1/subscriptions/")) {
          const subscription = this.subscriptions.get(segments[3]);
          if (method === "POST" && subscription) {
            subscription.cancel_at_period_end = body.get("cancel_at_period_end") === "true";
            subscription.canceled_at = Math.floor(Date.now() / 1000);
          }
          value = subscription;
        } else if (path.startsWith("/v1/coupons/")) {
          value = this.couponExpansions.get(segments[3]) ??
            [...this.subscriptions.values()].flatMap(subscription => subscription.discounts)
              .find(discount => typeof discount !== "string" && discount.coupon?.id === segments[3]);
          if (value && typeof value === "object" && "coupon" in value) value = value.coupon;
        }
        if (!value) throw new Error(`Unexpected synthetic Stripe request: ${method} ${path}`);
        return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
      }),
    });
  }
  activate(sessionId: string, options: { discounted?: boolean; duration?: "once" | "repeating" | "forever" } = {}): Stripe.Subscription {
    const session = this.sessions.get(sessionId)!;
    const interval = session.metadata.interval as CandidateBillingInterval;
    const now = Math.floor(Date.now() / 1000);
    const id = `sub_${sessionId}`;
    const periodEnd = now + (interval === "month" ? 30 : 365) * 86400;
    const discounts = options.discounted ? [{ id: `di_${id}`, object: "discount", start: now - 1,
      end: options.duration === "repeating" ? now + 90 * 86400 : null,
      coupon: { id: `coupon_${id}`, percent_off: 100, duration: options.duration ?? "forever",
        applies_to: { products: options.duration && options.duration !== "forever" ? ["candidate_product_month"] : ["candidate_product_month", "candidate_product_year"] } } }] : [];
    const subscription = {
      id, object: "subscription", customer: session.customer, metadata: session.metadata, status: "active",
      cancel_at_period_end: false, canceled_at: null, cancel_at: null, pause_collection: null,
      items: { has_more: false, data: [{ id: `si_${id}`, quantity: 1, price: this.prices[interval],
        current_period_start: now - 1, current_period_end: periodEnd, discounts: [] }] },
      discounts,
      latest_invoice: { id: `in_${id}`, object: "invoice", status: "paid", customer: session.customer, currency: "usd",
        amount_paid: options.discounted ? 0 : interval === "month" ? 999 : 9590,
        total: options.discounted ? 0 : interval === "month" ? 999 : 9590,
        parent: { subscription_details: { subscription: id } } },
    } as unknown as Stripe.Subscription;
    session.status = "complete"; session.payment_status = options.discounted ? "no_payment_required" : "paid"; session.subscription = id;
    this.subscriptions.set(id, subscription);
    return subscription;
  }
  event(type: string, object: Stripe.Event.Data.Object, created = Math.floor(Date.now() / 1000), id = `evt_${randomUUID()}`): { raw: Buffer; signature: string } {
    const raw = Buffer.from(JSON.stringify({ id, object: "event", type, created, data: { object } }));
    return { raw, signature: this.stripe.webhooks.generateTestHeaderString({ payload: raw.toString(), secret: "whsec_candidate_synthetic" }) };
  }
}
