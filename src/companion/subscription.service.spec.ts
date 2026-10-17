import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { SubscriptionService } from "./subscription.service";
import { deviceInput } from "./device-execution.protocol";

const requestId = "3b7837f3-2e09-4b86-a2c5-51b53b3d0a61";
function candidatePrice(interval: "month" | "year" = "month") {
  return {
    id: interval === "month" ? "price_live" : "price_year",
    livemode: true,
    active: true,
    currency: "usd",
    unit_amount: interval === "month" ? 999 : 9590,
    recurring: { interval, interval_count: 1 },
    product: {
      id: `recruiters_rip_candidate_${interval}_v1`,
      livemode: true,
      active: true,
      metadata: { purpose: "recruiters-rip-candidate-v1" },
    },
  };
}
function sessionLines(interval: "month" | "year" = "month") {
  return { has_more: false, data: [{ quantity: 1, price: candidatePrice(interval) }] };
}
function paidSubscription(interval: "month" | "year" = "month") {
  const now = Math.floor(Date.now() / 1000);
  const price = candidatePrice(interval);
  return {
    id: "sub_original", customer: "cus_owned", livemode: true,
    status: "active", canceled_at: null, trial_start: null, trial_end: null,
    metadata: { candidateId: "123", purpose: "recruiters-membership" },
    discounts: [] as Stripe.Discount[],
    items: { data: [{
      id: "si_owned", quantity: 1, discounts: [],
      current_period_start: now - 100, current_period_end: now + 86400,
      price: { ...price, product: price.product.id },
    }] },
    latest_invoice: {
      id: "in_owned", customer: "cus_owned", livemode: true,
      status: "paid", currency: "usd", amount_paid: price.unit_amount,
      amount_due: price.unit_amount, total: price.unit_amount,
      amount_remaining: 0, discounts: [], total_discount_amounts: [],
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_original" } },
      lines: { has_more: false, data: [{
        id: "il_owned", livemode: true, invoice: "in_owned", quantity: 1,
        subscription: "sub_original", discounts: [], discount_amounts: [],
        currency: "usd", amount: price.unit_amount,
        parent: { type: "subscription_item_details", subscription_item_details: {
          subscription: "sub_original", subscription_item: "si_owned", proration: false,
        } },
        pricing: { price_details: { price: price.id, product: price.product.id } },
        period: { start: now - 100, end: now + 86400 },
      }] },
    },
  };
}

interface BillingHarness {
  service: SubscriptionService;
  query: jest.Mock<Promise<Record<string, unknown>[]>, [string, unknown[]?]>;
  retrieve: jest.Mock;
  create: jest.Mock;
  expire: jest.Mock;
  retrievePrice: jest.Mock;
  retrieveCoupon: jest.Mock;
}

function billing(): BillingHarness {
  const query = jest.fn<
    Promise<Record<string, unknown>[]>,
    [string, unknown[]?]
  >();
  const retrieve = jest.fn();
  const create = jest.fn();
  const expire = jest.fn();
  const retrieveCoupon = jest.fn();
  const retrievePrice = jest.fn().mockImplementation(async id =>
    candidatePrice(id === "price_year" ? "year" : "month"),
  );
  // These DI doubles implement only the database/provider paths under test.
  const manager = { query } as unknown as EntityManager;
  const db = {
    query,
    transaction: <T>(work: (value: EntityManager) => Promise<T>) =>
      work(manager),
  } as unknown as PostgresService;
  const stripe = {
    checkout: { sessions: { retrieve, create, expire } },
    prices: { retrieve: retrievePrice },
    coupons: { retrieve: retrieveCoupon },
  } as unknown as Stripe;
  const service = new SubscriptionService(
    db,
    new ConfigService({
      STRIPE_CANDIDATE_PRICE_ID: "price_live",
      STRIPE_CANDIDATE_YEARLY_PRICE_ID: "price_year",
      ORG_ADMIN_DOMAIN: "https://admin.jobstash.xyz",
      RECRUITERS_PUBLIC_ORIGIN: "https://recruiters.rip",
    }),
    stripe,
  );
  return { service, query, retrieve, create, expire, retrievePrice, retrieveCoupon };
}

function completedEvent(): Stripe.Event {
  // Signed-event dispatcher input; signature verification belongs to StripeController.
  const event = {
    id: "evt_paid",
    livemode: true,
    type: "checkout.session.completed",
    created: 1791504000,
    data: {
      object: {
        object: "checkout.session",
        id: "cs_owned",
        metadata: { purpose: "recruiters-membership" },
      },
    },
  } as unknown as Stripe.Event;
  return event;
}

describe("candidate billing authority", () => {
  it("returns candidate checkout to its own product when the administrative domain differs", async () => {
    const { service, query, create } = billing();
    query.mockImplementation(async sql =>
      sql.startsWith("SELECT id::text") ? [{ id: "123" }] : [],
    );
    create.mockResolvedValue({
      id: "cs_candidate",
      livemode: true,
      url: "https://checkout.stripe.com/c/pay/candidate",
    });
    await service.checkout("wallet", {
      requestId: "3b7837f3-2e09-4b86-a2c5-51b53b3d0a61",
      interval: "month",
    });
    const checkout = create.mock.calls[0][0];
    expect(checkout.success_url).toBe(
      "https://recruiters.rip/onboarding/membership/return",
    );
    expect(checkout.cancel_url).toBe(
      "https://recruiters.rip/onboarding/membership/return",
    );
    expect(checkout.allow_promotion_codes).toBe(true);
    expect(checkout.payment_method_collection).toBe("if_required");
  });

  it("requires an authenticated unique existing account", async () => {
    const { service, query } = billing();
    await expect(service.owner("")).rejects.toThrow("Account required");
    expect(query).not.toHaveBeenCalled();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "1" }, { id: "2" }]);
    await expect(service.owner("wallet")).rejects.toThrow("unique account");
    await expect(service.owner("wallet")).rejects.toThrow("unique account");
  });

  it("never assigns another checkout using event metadata", async () => {
    const { service, query, retrieve } = billing();
    query.mockResolvedValue([]);
    await expect(service.webhook(completedEvent())).resolves.toBe(true);
    expect(retrieve).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(["cs_owned", null]);
  });

  it("leaves unrelated organization billing with its existing handler", async () => {
    const { service, query } = billing();
    query.mockResolvedValue([]);
    const event = completedEvent();
    // A distinct provider event carries no candidate purpose.
    const foreign = {
      ...event,
      data: {
        object: { object: "checkout.session", id: "cs_org", metadata: {} },
      },
    } as unknown as Stripe.Event;
    await expect(service.webhook(foreign)).resolves.toBe(false);
  });

  it("does not process a repeated payment event twice", async () => {
    const { service, query, retrieve } = billing();
    query
      .mockResolvedValueOnce([{ checkout_id: "cs_owned", user_node_id: "123" }])
      .mockResolvedValueOnce([{ checkout_id: "cs_owned" }])
      .mockResolvedValueOnce([]);
    await expect(service.webhook(completedEvent())).resolves.toBe(true);
    expect(retrieve).not.toHaveBeenCalled();
    expect(query.mock.calls[2][0]).toContain("ON CONFLICT DO NOTHING");
  });

  it("rejects test-mode events even when the checkout ID is owned", async () => {
    const { service, query, retrieve } = billing();
    query.mockResolvedValueOnce([
      { checkout_id: "cs_owned", user_node_id: "123" },
    ]);
    await expect(
      service.webhook({ ...completedEvent(), livemode: false }),
    ).rejects.toThrow("Test payment events");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("fails closed when Stripe cannot refresh a nonterminal agreement", async () => {
    const { service, query, retrieve } = billing();
    query
      .mockResolvedValueOnce([{ checkout_id: "cs_owned" }])
      .mockResolvedValueOnce([{ checkout_id: "cs_owned" }]);
    retrieve.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(service.refresh("123")).rejects.toThrow(
      "provider unavailable",
    );
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
      false,
    );
  });

  it("refuses a completed live checkout belonging to a different account", async () => {
    const { service, query, retrieve } = billing();
    query
      .mockResolvedValueOnce([{ checkout_id: "cs_owned" }])
      .mockResolvedValueOnce([{ checkout_id: "cs_owned" }]);
    retrieve.mockResolvedValueOnce({
      livemode: true,
      mode: "subscription",
      client_reference_id: "456",
      metadata: { candidateId: "456", purpose: "recruiters-membership" },
    });
    await expect(service.refresh("123")).rejects.toThrow("account binding");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
      false,
    );
  });

  it("coalesces concurrent owner reads but never caches a completed refresh", async () => {
    const { service, query, retrieve } = billing();
    query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT checkout_id FROM"))
        return [{ checkout_id: "cs_owned" }];
      if (sql.includes("FOR UPDATE"))
        return [{ checkout_id: "cs_owned", billing_state: "open" }];
      return [];
    });
    let resolveProvider!: (value: unknown) => void;
    const provider = new Promise(resolve => {
      resolveProvider = resolve;
    });
    retrieve.mockReturnValue(provider);
    const first = service.refresh("123");
    const second = service.refresh("123");
    resolveProvider({
      livemode: true,
      mode: "subscription",
      status: "open",
      client_reference_id: "123",
      metadata: { candidateId: "123", purpose: "recruiters-membership" },
      line_items: sessionLines(),
    });
    await Promise.all([first, second]);
    expect(retrieve).toHaveBeenCalledTimes(1);
    await service.refresh("123");
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it("does not revisit terminal history, including a row retired while waiting for its lock", async () => {
    const { service, query, retrieve } = billing();
    query
      .mockResolvedValueOnce([{ checkout_id: "cs_old" }])
      .mockResolvedValueOnce([
        { checkout_id: "cs_old", billing_state: "terminal" },
      ]);
    retrieve.mockRejectedValue(new Error("old checkout unavailable"));
    await service.refresh("123");
    expect(query.mock.calls[0][0]).toContain("billing_state<>'terminal'");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("blocks replacement after failed renewal and recovers the same agreement without creating another", async () => {
    const { service, query, retrieve, create } = billing();
    const subscription = paidSubscription();
    subscription.status = "past_due";
    subscription.latest_invoice.status = "open";
    subscription.latest_invoice.amount_paid = 0;
    subscription.latest_invoice.amount_remaining = 999;
    const stored = {
      checkout_id: "cs_owned",
      billing_state: "agreement",
      status: "expired",
      subscription_id: "sub_original",
    };
    retrieve.mockResolvedValue({
      livemode: true,
      mode: "subscription",
      status: "complete",
      client_reference_id: "123",
      metadata: { candidateId: "123", purpose: "recruiters-membership" },
      subscription,
      line_items: sessionLines(),
    });
    query.mockImplementation(async (sql, values) => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.startsWith("SELECT id FROM graph_nodes")) return [{ id: "123" }];
      if (sql.startsWith("SELECT checkout_id")) return [stored];
      if (sql.startsWith("UPDATE")) {
        stored.status = String(values?.[1]);
        stored.subscription_id = String(values?.[4]);
        stored.billing_state = String(values?.[5]);
      }
      return [];
    });
    await expect(
      service.checkout("wallet", {
        requestId: "3b7837f3-2e09-4b86-a2c5-51b53b3d0a61",
        interval: "month",
      }),
    ).rejects.toThrow("existing membership billing agreement");
    expect(stored.status).toBe("expired");
    expect(stored.billing_state).toBe("agreement");
    subscription.status = "active";
    subscription.latest_invoice.status = "paid";
    subscription.latest_invoice.amount_paid = 999;
    subscription.latest_invoice.amount_remaining = 0;
    await service.refresh("123");
    expect(stored.status).toBe("active");
    expect(stored.subscription_id).toBe("sub_original");
    expect(create).not.toHaveBeenCalled();
  });
  it("refreshes current access without contacting irrelevant terminal history", async () => {
    const { service, query, retrieve } = billing();
    query.mockImplementation(async sql => {
      if (sql.includes("billing_state<>'terminal'"))
        return [{ checkout_id: "cs_current" }];
      if (sql.includes("FOR UPDATE"))
        return [{ checkout_id: "cs_current", billing_state: "open" }];
      return [];
    });
    retrieve.mockImplementation(async id => {
      if (id !== "cs_current")
        throw new Error("old terminal checkout unavailable");
      return {
        livemode: true,
        mode: "subscription",
        status: "open",
        client_reference_id: "123",
        metadata: { candidateId: "123", purpose: "recruiters-membership" },
        line_items: sessionLines(),
      };
    });
    await service.refresh("123");
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve.mock.calls[0][0]).toBe("cs_current");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
      true,
    );
  });

  it("accepts only the exact checkout UUID and explicit supported interval contract", () => {
    expect(deviceInput("checkout", { requestId, interval: "year" })).toEqual({ requestId, interval: "year" });
    for (const body of [
      { requestId }, { requestId, interval: "week" }, { requestId: "invalid", interval: "month" },
      { requestId, interval: "month", priceId: "price_foreign" },
      { requestId, interval: "year", code: "client-code" },
    ]) expect(() => deviceInput("checkout", body)).toThrow("Invalid companion input");
  });

  it.each(["month", "year"] as const)("creates the configured %s plan with native promotion codes", async interval => {
    const h = billing();
    h.query.mockImplementation(async sql => sql.startsWith("SELECT id::text") ? [{ id: "123" }] : []);
    h.create.mockResolvedValue({ id: "cs_new", livemode: true, url: "https://checkout.stripe.com/c/pay/new" });
    await h.service.checkout("wallet", { requestId, interval });
    expect(h.retrievePrice.mock.calls[0][0]).toBe(interval === "month" ? "price_live" : "price_year");
    expect(h.create.mock.calls[0][0]).toMatchObject({
      line_items: [{ price: interval === "month" ? "price_live" : "price_year", quantity: 1 }],
      allow_promotion_codes: true, payment_method_collection: "if_required",
    });
    expect(h.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO candidate_subscriptions"))?.[1]?.[4]).toBe(interval);
  });

  it.each(["amount", "currency", "cadence", "product", "purpose", "inactive", "test"] as const)(
    "rejects a fresh checkout with a mismatched %s before session creation", async kind => {
      const h = billing();
      const price = candidatePrice("year");
      if (kind === "amount") price.unit_amount = 999;
      if (kind === "currency") price.currency = "eur";
      if (kind === "cadence") price.recurring.interval = "month";
      if (kind === "product") price.product.id = "prod_organization";
      if (kind === "purpose") price.product.metadata.purpose = "other";
      if (kind === "inactive") price.active = false;
      if (kind === "test") price.livemode = false;
      h.retrievePrice.mockResolvedValue(price);
      h.query.mockResolvedValue([{ id: "123" }]);
      await expect(h.service.checkout("wallet", { requestId, interval: "year" })).rejects.toThrow("Membership price");
      expect(h.create).not.toHaveBeenCalled();
    },
  );

  it.each(["month", "year"] as const)("reuses only a pending checkout of the requested %s interval", async interval => {
    const h = billing();
    h.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.includes("billing_state='open'")) return [{
        checkout_id: "cs_pending", checkout_url: "https://checkout.stripe.com/c/pay/pending", billing_interval: interval,
      }];
      return [];
    });
    await expect(h.service.checkout("wallet", { requestId, interval })).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/pending",
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.expire).not.toHaveBeenCalled();
  });

  it("binds retries to the originally requested interval instead of returning a wrong-plan URL", async () => {
    const h = billing();
    h.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.includes("request_id=$2")) return [{
        billing_state: "open", billing_interval: "month", checkout_url: "https://checkout.stripe.com/c/pay/month",
      }];
      return [];
    });
    await expect(h.service.checkout("wallet", { requestId, interval: "month" })).resolves.toMatchObject({
      checkoutUrl: "https://checkout.stripe.com/c/pay/month",
    });
    await expect(h.service.checkout("wallet", { requestId, interval: "year" })).rejects.toThrow("changed interval");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.expire).not.toHaveBeenCalled();
  });

  it("expires the old open interval under its subscription lock before creating the new plan", async () => {
    const h = billing();
    h.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.includes("billing_state='open'")) return [{
        checkout_id: "cs_month", checkout_url: "https://checkout.stripe.com/c/pay/month", billing_interval: "month",
      }];
      return [];
    });
    h.expire.mockResolvedValue({ id: "cs_month", livemode: true, status: "expired" });
    h.create.mockImplementation(async () => {
      expect(h.expire).toHaveBeenCalledWith("cs_month", {}, { timeout: 12000, maxNetworkRetries: 0 });
      expect(h.query.mock.calls.some(([sql]) => sql.includes("status='expired',billing_state='terminal'"))).toBe(true);
      return { id: "cs_year", livemode: true, url: "https://checkout.stripe.com/c/pay/year" };
    });
    await expect(h.service.checkout("wallet", { requestId, interval: "year" })).resolves.toMatchObject({
      checkoutUrl: "https://checkout.stripe.com/c/pay/year",
    });
    expect(h.query.mock.calls.find(([sql]) => sql.includes("billing_state='open'"))?.[0]).toContain("FOR UPDATE");
  });

  it("never creates a second agreement when an interval-switch expiration races checkout completion", async () => {
    const h = billing();
    h.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.includes("billing_state='open'")) return [{ checkout_id: "cs_month", billing_interval: "month" }];
      return [];
    });
    h.expire.mockRejectedValue(new Error("Session already complete"));
    await expect(h.service.checkout("wallet", { requestId, interval: "year" })).rejects.toThrow("already complete");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it.each(["month", "year"] as const)("reconciles a provider-paid %s agreement using its owned checkout price, not current config", async interval => {
    const h = billing();
    const subscription = paidSubscription(interval);
    subscription.items.data[0].price.id = "price_previous";
    subscription.latest_invoice.lines.data[0].pricing.price_details.price = "price_previous";
    const lines = sessionLines(interval);
    lines.data[0].price.id = "price_previous";
    h.retrieve.mockResolvedValue({
      livemode: true, mode: "subscription", status: "complete",
      client_reference_id: "123", metadata: { candidateId: "123", purpose: "recruiters-membership" },
      line_items: lines, subscription,
    });
    h.query.mockImplementation(async sql => sql.startsWith("SELECT checkout_id") ? [{
      checkout_id: "cs_owned", billing_state: "agreement",
    }] : []);
    await h.service.refresh("123");
    const persisted = h.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"));
    expect(persisted?.[1]?.[1]).toBe("active");
    expect(persisted?.[1]?.[6]).toBe(interval);
    expect(h.retrievePrice).not.toHaveBeenCalled();
  });

  it.each([
    { interval: "month" as const, percentOff: 70, duration: "once" },
    { interval: "month" as const, percentOff: 100, duration: "forever" },
    { interval: "year" as const, percentOff: 100, duration: "forever" },
  ])("retrieves omitted coupon scope before granting a paid $interval period with $percentOff percent off", async ({ interval, percentOff, duration }) => {
    const h = billing();
    const subscription = paidSubscription(interval);
    const amount = subscription.items.data[0].price.unit_amount;
    const discountAmount = Math.round(amount * percentOff / 100);
    const discount = {
      id: "di_owned", customer: "cus_owned", subscription: "sub_original",
      subscription_item: null, invoice: null, invoice_item: null,
      start: subscription.items.data[0].current_period_start, end: null,
      coupon: { id: "coupon_owned", livemode: true, amount_off: null, percent_off: percentOff, duration },
    } as unknown as Stripe.Discount;
    subscription.discounts.push(discount);
    subscription.latest_invoice.amount_paid = amount - discountAmount;
    subscription.latest_invoice.amount_due = amount - discountAmount;
    subscription.latest_invoice.total = amount - discountAmount;
    Object.assign(subscription.latest_invoice.lines.data[0], {
      discount_amounts: [{ amount: discountAmount, discount: "di_owned" }],
    });
    h.retrieveCoupon.mockResolvedValue({
      ...discount.coupon, applies_to: { products: [`recruiters_rip_candidate_${interval}_v1`] },
    });
    h.retrieve.mockResolvedValue({
      livemode: true, mode: "subscription", status: "complete", client_reference_id: "123",
      metadata: { candidateId: "123", purpose: "recruiters-membership" },
      line_items: sessionLines(interval), subscription,
    });
    h.query.mockImplementation(async sql => sql.startsWith("SELECT checkout_id") ? [{ checkout_id: "cs_owned" }] : []);
    await h.service.refresh("123");
    expect(h.retrieveCoupon).toHaveBeenCalledWith("coupon_owned", { expand: ["applies_to"] }, { timeout: 12000, maxNetworkRetries: 0 });
    const persisted = h.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"));
    expect(persisted?.[1]?.[1]).toBe("active");
    expect(persisted?.[1]?.[7]).toEqual({
      percentOff,
      endsAt: duration === "forever" ? null : new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
    });
  });

  it("exposes the frontend prices, actual subscription interval and Stripe discount state", async () => {
    const h = billing();
    const subscription = {
      status: "active", paidUntil: new Date(), cancelledAt: null,
      checkoutUrl: "https://checkout.stripe.com/c/pay/year", interval: "year",
      provider: "stripe", discount: { percentOff: 100, endsAt: null },
    };
    h.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.startsWith("SELECT CASE")) return [subscription];
      if (sql.startsWith("SELECT EXISTS")) return [{ active: true }];
      return [];
    });
    await expect(h.service.status("wallet")).resolves.toEqual({
      advanced: true, price: { amount: "95.90", currency: "USD", interval: "year" },
      prices: {
        month: { amount: "9.99", currency: "USD", interval: "month" },
        year: { amount: "95.90", currency: "USD", interval: "year" },
      },
      subscription,
    });
  });

  it.each(["open", "complete"] as const)("does not grant access from a %s checkout or redirect without an active provider agreement", async status => {
    const h = billing();
    const subscription = paidSubscription();
    subscription.status = "incomplete";
    h.retrieve.mockResolvedValue({
      livemode: true, mode: "subscription", status, client_reference_id: "123",
      metadata: { candidateId: "123", purpose: "recruiters-membership" },
      line_items: sessionLines(), subscription: status === "complete" ? subscription : null,
    });
    h.query.mockImplementation(async sql => sql.startsWith("SELECT checkout_id") ? [{ checkout_id: "cs_owned" }] : []);
    await h.service.refresh("123");
    expect(h.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"))?.[1]?.[1]).toBe("pending");
  });

  it("checks for newly reconciled agreements only after taking the shared subscription locks", async () => {
    const h = billing();
    let locked = false;
    h.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
      if (sql.includes("billing_state<>'terminal'") && sql.includes("FOR UPDATE")) locked = true;
      if (sql.includes("billing_state IN")) {
        expect(locked).toBe(true);
        return [{ checkout_id: "cs_just_completed" }];
      }
      return [];
    });
    await expect(h.service.checkout("wallet", { requestId, interval: "year" })).rejects.toThrow("existing membership billing agreement");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.expire).not.toHaveBeenCalled();
  });
});
