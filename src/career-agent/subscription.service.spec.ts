import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import * as Ajv from "ajv";
import Stripe from "stripe";
import { CandidateCheckoutInput, CandidateBillingMutationInput } from "./career.dto";
import { candidateSchemas } from "./candidate-capabilities.dto";
import { CandidateBillingMemoryFixture } from "./candidate-billing-memory.fixture";
import { CandidateStripeFixture } from "./candidate-stripe.fixture";
import { CareerRepository } from "./career.repository";
import { SubscriptionService } from "./subscription.service";
import { candidateStripeState, validateCandidatePrice, CandidateStripeBinding } from "./stripe-candidate-subscription";

function billingFixture() {
  const database = new CandidateBillingMemoryFixture();
  const provider = new CandidateStripeFixture();
  const career = new CareerRepository(database.database);
  const billing = new SubscriptionService(database.database, career, provider.config, provider.stripe);
  return { database, provider, billing };
}
describe("Candidate Stripe membership (synthetic, no network/database)", () => {
  it("requires a UUID and explicit interval, with no client revision or entitlement fields", () => {
    const checkout = new Ajv().compile(candidateSchemas.subscription_checkout);
    expect(checkout({ requestId: randomUUID(), interval: "month" })).toBe(true);
    expect(checkout({ requestId: randomUUID(), interval: "year" })).toBe(true);
    for (const input of [{ requestId: randomUUID() }, { requestId: "invalid", interval: "month" },
      { requestId: randomUUID(), interval: "forever" }, { requestId: randomUUID(), interval: "month", revision: 0 },
      { requestId: randomUUID(), interval: "month", advanced: true }]) expect(checkout(input)).toBe(false);
    expect(validateSync(plainToInstance(CandidateCheckoutInput, { requestId: randomUUID(), interval: "year" }))).toHaveLength(0);
    expect(validateSync(plainToInstance(CandidateCheckoutInput, { requestId: randomUUID() }))).not.toHaveLength(0);
    expect(validateSync(plainToInstance(CandidateBillingMutationInput, { requestId: "bad" }))).not.toHaveLength(0);
  });
  it("replays mutations, reuses same-interval pending checkout, and expires pending checkout on interval change", async () => {
    const { billing, provider } = billingFixture();
    const input = { requestId: randomUUID(), interval: "month" as const };
    const monthly = await billing.checkout("alice", input);
    expect(await billing.checkout("alice", input)).toEqual(monthly);
    expect(await billing.checkout("alice", { ...input, requestId: randomUUID() })).toEqual(monthly);
    expect((await billing.status("alice")).advanced).toBe(false);
    const yearly = await billing.checkout("alice", { requestId: randomUUID(), interval: "year" });
    expect(yearly.checkoutUrl).not.toEqual(monthly.checkoutUrl);
    expect([...provider.sessions.values()].map(session => session.status)).toEqual(["expired", "open"]);
    expect(await billing.status("alice")).toMatchObject({ advanced: false,
      price: { amount: "95.90", interval: "year", currency: "USD" },
      prices: { month: { amount: "9.99", interval: "month" }, year: { amount: "95.90", interval: "year" } },
      subscription: { interval: "year", status: "pending", discount: null } });
    const requests = provider.requests.filter(request => request.path === "/v1/checkout/sessions" && request.method === "POST");
    expect(requests).toHaveLength(2);
    expect(requests[0].body.get("allow_promotion_codes")).toBe("true");
    expect(requests[0].body.get("payment_method_collection")).toBe("if_required");
    expect(requests[0].body.get("subscription_data[metadata][candidateId]")).toBe("1");
    await expect(billing.checkout("alice", { ...input, interval: "year" })).rejects.toThrow("different input");
  });
  it.each(["month", "year"] as const)("activates a provider-confirmed zero-dollar %s subscription, not a return URL", async interval => {
    const { billing, provider, database } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval });
    const session = [...provider.sessions.values()][0];
    const subscription = provider.activate(session.id, { discounted: true });
    expect((await billing.status("alice")).advanced).toBe(false);
    const event = provider.event("checkout.session.completed", session);
    await expect(billing.webhook(event.raw, "invalid")).rejects.toThrow("signature");
    await expect(billing.webhook(Buffer.concat([event.raw, Buffer.from(" ")]), event.signature)).rejects.toThrow("signature");
    await Promise.all([billing.webhook(event.raw, event.signature), billing.webhook(event.raw, event.signature)]);
    expect(database.events.size).toBe(1);
    expect(await billing.status("alice")).toMatchObject({ advanced: true, subscription: { interval, discount: { percentOff: 100, endsAt: null } } });
    expect((await billing.status("bob")).advanced).toBe(false);
    await expect(billing.checkout("alice", { requestId: randomUUID(), interval })).rejects.toThrow("already exists");
    subscription.items.data[0].current_period_end += 30 * 86400;
    const renewal = provider.event("invoice.paid", subscription.latest_invoice);
    await billing.webhook(renewal.raw, renewal.signature);
    expect(await billing.status("alice")).toMatchObject({ subscription: { paidUntil: new Date(subscription.items.data[0].current_period_end * 1000).toISOString() } });
  });
  it("records finite discount end dates and rejects annual finite or unrestricted monthly coupons", async () => {
    for (const duration of ["once", "repeating"] as const) {
      const { billing, provider } = billingFixture();
      await billing.checkout("alice", { requestId: randomUUID(), interval: "month" });
      const session = [...provider.sessions.values()][0];
      const subscription = provider.activate(session.id, { discounted: true, duration });
      const event = provider.event("checkout.session.completed", session);
      await billing.webhook(event.raw, event.signature);
      const discount = subscription.discounts[0];
      if (typeof discount === "string") throw new Error("Fixture discount must be expanded");
      const end = duration === "once" ? subscription.items.data[0].current_period_end : discount.end;
      expect(await billing.status("alice")).toMatchObject({ advanced: true, subscription: { discount: { percentOff: 100, endsAt: new Date(end * 1000).toISOString() } } });
    }
    for (const interval of ["month", "year"] as const) {
      const { billing, provider } = billingFixture();
      await billing.checkout("alice", { requestId: randomUUID(), interval });
      const session = [...provider.sessions.values()][0];
      const subscription = provider.activate(session.id, { discounted: true, duration: "once" });
      const discount = subscription.discounts[0];
      if (typeof discount === "string") throw new Error("Fixture discount must be expanded");
      if (interval === "month") discount.coupon.applies_to = undefined;
      const event = provider.event("checkout.session.completed", session);
      await expect(billing.webhook(event.raw, event.signature)).rejects.toThrow("monthly product");
      expect((await billing.status("alice")).advanced).toBe(false);
    }
  });
  it.each(["month", "year"] as const)("keeps a 70%% first-month offer scoped correctly for %s billing", async interval => {
    const { billing, provider } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval });
    const session = [...provider.sessions.values()][0];
    const subscription = provider.activate(session.id, { discounted: true, duration: "once" });
    const discount = subscription.discounts[0];
    if (typeof discount === "string") throw new Error("Fixture discount must be expanded");
    discount.coupon.percent_off = 70;
    const event = provider.event("checkout.session.completed", session);
    if (interval === "year") {
      await expect(billing.webhook(event.raw, event.signature)).rejects.toThrow();
      expect((await billing.status("alice")).advanced).toBe(false);
    } else {
      await billing.webhook(event.raw, event.signature);
      expect(await billing.status("alice")).toMatchObject({ advanced: true, subscription: { discount: {
        percentOff: 70, endsAt: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
      } } });
    }
  });
  it("reads product scope that Stripe omits from expanded subscription coupons", async () => {
    const { billing, provider } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval: "month" });
    const session = [...provider.sessions.values()][0];
    const subscription = provider.activate(session.id, { discounted: true, duration: "once" });
    const discount = subscription.discounts[0];
    if (typeof discount === "string") throw new Error("Fixture discount must be expanded");
    discount.coupon.percent_off = 70;
    provider.couponExpansions.set(discount.coupon.id, structuredClone(discount.coupon));
    delete discount.coupon.applies_to;
    const event = provider.event("checkout.session.completed", session);
    await billing.webhook(event.raw, event.signature);
    expect(await billing.status("alice")).toMatchObject({ advanced: true, subscription: { discount: {
      percentOff: 70, endsAt: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
    } } });
  });
  it("keeps paid access through confirmed cancellation and refuses stale renewal snapshots after cancellation", async () => {
    const { billing, provider, database } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval: "month" });
    const session = [...provider.sessions.values()][0];
    const subscription = provider.activate(session.id);
    const event = provider.event("checkout.session.completed", session);
    await billing.webhook(event.raw, event.signature);
    const cancelInput = { requestId: randomUUID() };
    const canceled = await billing.cancel("alice", cancelInput);
    expect(canceled.cancelAtPeriodEnd).toBe(true); expect(canceled.cancelledAt).not.toBeNull();
    expect(await billing.cancel("alice", cancelInput)).toEqual(canceled);
    subscription.cancel_at_period_end = false; subscription.canceled_at = null;
    subscription.items.data[0].current_period_end += 30 * 86400;
    const delayed = provider.event("customer.subscription.updated", subscription);
    await billing.webhook(delayed.raw, delayed.signature);
    expect(await billing.status("alice")).toMatchObject({ advanced: true, subscription: { paidUntil: canceled.paidUntil, cancelledAt: canceled.cancelledAt } });
    subscription.status = "canceled";
    const deleted = provider.event("customer.subscription.deleted", subscription, Math.floor(Date.now() / 1000) - 5);
    subscription.status = "active"; // Simulate a stale provider read after its signed terminal event.
    await billing.webhook(deleted.raw, deleted.signature);
    const stale = provider.event("customer.subscription.updated", subscription, Math.floor(Date.now() / 1000) + 1);
    await billing.webhook(stale.raw, stale.signature);
    for (const row of database.subscriptions.values()) { row.reconciled_at = null; row.reconcile_attempt_at = null; }
    await billing.reconcile();
    expect((await billing.status("alice")).advanced).toBe(false);
  });
  it("fails closed on malformed/foreign bindings and inactive or unpaid subscriptions", async () => {
    const { billing, provider, database } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval: "month" });
    const session = [...provider.sessions.values()][0];
    const subscription = provider.activate(session.id);
    const original = structuredClone(subscription);
    const changes: ((value: Stripe.Subscription) => void)[] = [
      value => { value.customer = "cus_foreign"; }, value => { value.metadata.candidateId = "2"; },
      value => { value.metadata.purpose = "recruiter"; }, value => { value.metadata.checkoutRequestId = randomUUID(); },
      value => { value.items.data = []; }, value => { value.items.data[0].quantity = 2; },
      value => { value.items.data[0].price.id = "price_foreign"; }, value => { value.items.data[0].current_period_end = 0; },
    ];
    for (const change of changes) {
      const invalid = structuredClone(original); change(invalid); provider.subscriptions.set(invalid.id, invalid);
      const event = provider.event("checkout.session.completed", session);
      await expect(billing.webhook(event.raw, event.signature)).rejects.toThrow();
      expect((await billing.status("alice")).advanced).toBe(false);
    }
    const binding: CandidateStripeBinding = [...database.subscriptions.values()][0];
    for (const status of ["incomplete", "trialing", "past_due", "unpaid", "paused", "canceled", "incomplete_expired"] as const) {
      const invalid = structuredClone(original); invalid.status = status;
      expect(candidateStripeState(invalid, binding).status).not.toBe("active");
    }
    const unpaid = structuredClone(original); const invoice = unpaid.latest_invoice;
    if (invoice && typeof invoice !== "string") invoice.status = "open";
    expect(candidateStripeState(unpaid, binding).status).toBe("expired");
    const foreign = provider.event("checkout.session.completed", { ...session, id: "cs_foreign" });
    await billing.webhook(foreign.raw, foreign.signature);
    expect((await billing.status("bob")).advanced).toBe(false);
  });
  it("binds the retrieved checkout session as well as the subscription before activation", async () => {
    const { billing, provider } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval: "month" });
    const session = [...provider.sessions.values()][0];
    const subscription = provider.activate(session.id);
    const original = structuredClone(session);
    const changes: ((value: Stripe.Checkout.Session) => void)[] = [
      value => { value.customer = "cus_foreign"; }, value => { value.client_reference_id = "2"; },
      value => { value.metadata.candidateId = "2"; }, value => { value.metadata.interval = "year"; },
      value => { value.line_items.data[0].price.id = "price_foreign"; },
      value => { value.line_items.data[0].quantity = 2; }, value => { value.mode = "payment"; },
    ];
    for (const change of changes) {
      const invalid = structuredClone(original); change(invalid); provider.sessions.set(invalid.id, invalid);
      const event = provider.event("checkout.session.completed", original);
      await expect(billing.webhook(event.raw, event.signature)).rejects.toThrow();
      expect((await billing.status("alice")).advanced).toBe(false);
    }
    provider.sessions.set(original.id, original);
    const foreign = provider.event("customer.subscription.created", { ...subscription, id: "sub_foreign" });
    await expect(billing.webhook(foreign.raw, foreign.signature)).rejects.toThrow("stored checkout");
    expect((await billing.status("alice")).advanced).toBe(false);
  });
  it("enforces monthly/yearly amount, currency, interval and separate candidate products", async () => {
    const { provider, billing } = billingFixture();
    for (const interval of ["month", "year"] as const) {
      expect(validateCandidatePrice(provider.prices[interval], interval)).toBe(`candidate_product_${interval}`);
      const price = structuredClone(provider.prices[interval]); price.unit_amount += 1;
      expect(() => validateCandidatePrice(price, interval)).toThrow("price");
      price.unit_amount -= 1; price.currency = "eur";
      expect(() => validateCandidatePrice(price, interval)).toThrow("price");
      price.currency = "usd"; price.recurring.interval_count = 2;
      expect(() => validateCandidatePrice(price, interval)).toThrow("price");
      price.recurring.interval_count = 1; price.recurring.interval = interval === "month" ? "year" : "month";
      expect(() => validateCandidatePrice(price, interval)).toThrow("price");
    }
    provider.prices.year.product = provider.prices.month.product;
    await expect(billing.checkout("alice", { requestId: randomUUID(), interval: "year" })).rejects.toThrow("separate products");
  });
  it("expires on the exact provider period during reconciliation", async () => {
    const { billing, provider, database } = billingFixture();
    await billing.checkout("alice", { requestId: randomUUID(), interval: "year" });
    const session = [...provider.sessions.values()][0]; const subscription = provider.activate(session.id);
    const event = provider.event("checkout.session.completed", session); await billing.webhook(event.raw, event.signature);
    subscription.items.data[0].current_period_start = Math.floor(Date.now() / 1000) - 365 * 86400;
    subscription.items.data[0].current_period_end = Math.floor(Date.now() / 1000) - 1;
    for (const row of database.subscriptions.values()) { row.reconciled_at = null; row.reconcile_attempt_at = null; }
    await billing.reconcile();
    expect((await billing.status("alice")).advanced).toBe(false);
  });
});
