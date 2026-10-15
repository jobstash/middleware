import { ConfigService } from "@nestjs/config";
import { EntityManager } from "typeorm";
import Stripe from "stripe";
import { PostgresService } from "src/postgres/postgres.service";
import { SubscriptionService } from "./subscription.service";
import { deviceInput } from "./device-execution.protocol";

const requestId = "617773b0-77be-4d96-8f7a-fb63393946b9";
const requestKey = `recruiters-cancel:123:${requestId}`;

function cancellationHarness() {
  const now = Math.floor(Date.now() / 1000);
  const subscription = {
    id: "sub_owned",
    livemode: true,
    status: "active",
    canceled_at: null as number | null,
    cancel_at_period_end: false,
    trial_start: null,
    trial_end: null,
    metadata: { candidateId: "123", purpose: "recruiters-membership" },
    items: { data: [{
      quantity: 1,
      current_period_start: now - 100,
      current_period_end: now + 86400,
      price: { id: "price_live", currency: "usd", unit_amount: 999,
        recurring: { interval: "month", interval_count: 1 } },
    }] },
    latest_invoice: {
      livemode: true, status: "paid", currency: "usd", amount_paid: 999,
      amount_remaining: 0,
      lines: { data: [{ quantity: 1, pricing: { price_details: { price: "price_live" } },
        period: { start: now - 100, end: now + 86400 } }] },
    },
  };
  const session = { livemode: true, mode: "subscription", status: "complete",
    client_reference_id: "123",
    metadata: { candidateId: "123", purpose: "recruiters-membership" }, subscription };
  const requests = new Map<string, string>();
  const agreements = [{ checkout_id: "cs_owned" }];
  let ownsSubscription = true;
  let failPersist = false;
  const query = jest.fn(async (sql: string, args: unknown[] = []): Promise<Record<string, unknown>[]> => {
    if (sql.startsWith("SELECT id::text")) return [{ id: "123" }];
    if (sql.startsWith("SELECT id FROM graph_nodes")) return [{ id: "123" }];
    if (sql.startsWith("SELECT checkout_id FROM candidate_payment_events")) {
      const target = requests.get(String(args[0]));
      return target ? [{ checkout_id: target }] : [];
    }
    if (sql.startsWith("INSERT INTO candidate_payment_events")) {
      requests.set(String(args[0]), String(args[1]));
      return [];
    }
    if (sql.includes("billing_state IN")) return agreements;
    if (sql.includes("FOR UPDATE")) return ownsSubscription ? [{ checkout_id: args[0] }] : [];
    if (sql.startsWith("UPDATE candidate_subscriptions")) {
      if (failPersist) throw new Error("database unavailable");
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  // Serial transactions model the shared account/subscription locks without a database.
  let transactions = Promise.resolve();
  const transaction = jest.fn(<T>(work: (db: EntityManager) => Promise<T>): Promise<T> => {
    const result = transactions.then(() => work({ query } as unknown as EntityManager));
    transactions = result.then(() => undefined, () => undefined);
    return result;
  });
  const retrieve = jest.fn().mockImplementation(async () => structuredClone(session));
  const update = jest.fn().mockImplementation(async () => {
    subscription.cancel_at_period_end = true;
    subscription.canceled_at = now;
    return structuredClone(subscription);
  });
  const stripe = {
    checkout: { sessions: { retrieve } },
    subscriptions: { update },
  } as unknown as Stripe;
  const service = new SubscriptionService(
    { query, transaction } as unknown as PostgresService,
    new ConfigService({ STRIPE_CANDIDATE_PRICE_ID: "price_live" }), stripe,
  );
  return { service, query, transaction, retrieve, update, requests, agreements, subscription, session,
    paidUntil: new Date((now + 86400) * 1000).toISOString(),
    setOwnership: (owned: boolean) => { ownsSubscription = owned; },
    setPersistFailure: (fail: boolean) => { failPersist = fail; },
  };
}

describe("candidate cancel-at-period-end", () => {
  it("schedules only the authenticated owner's agreement without revoking paid access", async () => {
    const h = cancellationHarness();
    const result = await h.service.cancel("authenticated-wallet", { requestId });
    expect(result).toEqual({ cancelAtPeriodEnd: true, paidUntil: h.paidUntil,
      cancelledAt: new Date(h.subscription.canceled_at! * 1000).toISOString() });
    expect(h.query.mock.calls[0][1]).toEqual(["authenticated-wallet"]);
    expect(h.update).toHaveBeenCalledWith("sub_owned",
      { cancel_at_period_end: true, expand: ["latest_invoice"] },
      { idempotencyKey: requestKey, timeout: 12000, maxNetworkRetries: 0 });
    const persisted = h.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE candidate_subscriptions"));
    expect(persisted?.[1]).toEqual(["cs_owned", "active", h.paidUntil, result.cancelledAt, "sub_owned", "agreement"]);
    expect(h.requests.get(requestKey)).toBe("cs_owned");
  });

  it("rejects client IDs, invalid request IDs and missing account identity", async () => {
    const h = cancellationHarness();
    for (const body of [{ requestId, subscriptionId: "sub_foreign" }, { requestId, owner: "456" }, {}, { requestId: "invalid" }]) {
      expect(() => deviceInput("cancel", body)).toThrow("Invalid companion input");
      await expect(h.service.cancel("wallet", body)).rejects.toThrow("Invalid companion input");
    }
    await expect(h.service.cancel("", { requestId })).rejects.toThrow("Account required");
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each(["checkout", "subscription", "price", "livemode", "ownership"])("rejects foreign %s before any mutation", async kind => {
    const h = cancellationHarness();
    if (kind === "checkout") h.session.client_reference_id = "456";
    if (kind === "subscription") h.subscription.metadata.candidateId = "456";
    if (kind === "price") h.subscription.items.data[0].price.id = "price_foreign";
    if (kind === "livemode") h.subscription.livemode = false;
    if (kind === "ownership") h.setOwnership(false);
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("coalesces concurrent repeated requests through shared locks and live scheduling state", async () => {
    const h = cancellationHarness();
    const results = await Promise.all([
      h.service.cancel("wallet", { requestId }), h.service.cancel("wallet", { requestId: requestId.toUpperCase() }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(h.requests.size).toBe(1);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("does not issue another provider update for an already scheduled agreement", async () => {
    const h = cancellationHarness();
    h.subscription.cancel_at_period_end = true;
    h.subscription.canceled_at = Math.floor(Date.now() / 1000);
    await expect(h.service.cancel("wallet", { requestId })).resolves.toMatchObject({ cancelAtPeriodEnd: true });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("keeps retries bound to the original agreement after a provider failure and replacement", async () => {
    const h = cancellationHarness();
    h.update.mockRejectedValueOnce(new Error("Stripe unavailable"));
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow("could not be confirmed");
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    h.agreements[0].checkout_id = "cs_replacement";
    await h.service.cancel("wallet", { requestId });
    expect(h.retrieve.mock.calls.map(call => call[0])).toEqual(["cs_owned", "cs_owned"]);
    expect(h.update.mock.calls.map(call => call[0])).toEqual(["sub_owned", "sub_owned"]);
    expect(h.update.mock.calls.map(call => call[2].idempotencyKey)).toEqual([requestKey, requestKey]);
  });

  it("never redirects an old request to a replacement after the original agreement ends", async () => {
    const h = cancellationHarness();
    h.requests.set(requestKey, "cs_original");
    h.agreements[0].checkout_id = "cs_replacement";
    h.subscription.status = "canceled";
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow("No renewable membership");
    expect(h.retrieve.mock.calls[0][0]).toBe("cs_original");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("rejects provider read failures before attempting cancellation", async () => {
    const h = cancellationHarness();
    h.retrieve.mockRejectedValueOnce(new Error("Stripe unavailable"));
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow("could not be confirmed");
    expect(h.update).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("recovers a provider success followed by failed persistence without another cancellation", async () => {
    const h = cancellationHarness();
    h.setPersistFailure(true);
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow("could not be confirmed");
    h.setPersistFailure(false);
    await expect(h.service.cancel("wallet", { requestId })).resolves.toMatchObject({ paidUntil: h.paidUntil });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it.each(["flag", "id", "owner", "access", "period", "timestamp"])("never reports success for an unconfirmed %s", async kind => {
    const h = cancellationHarness();
    h.update.mockImplementationOnce(async () => {
      const value = structuredClone(h.subscription);
      value.cancel_at_period_end = kind !== "flag";
      value.canceled_at = kind === "timestamp" ? null : Math.floor(Date.now() / 1000);
      if (kind === "id") value.id = "sub_foreign";
      if (kind === "owner") value.metadata.candidateId = "456";
      if (kind === "access") value.status = "canceled";
      if (kind === "period") value.items.data[0].current_period_end -= 100;
      return value;
    });
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow();
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("allows stopping an unpaid agreement without fabricating access", async () => {
    const h = cancellationHarness();
    h.subscription.status = "past_due";
    h.subscription.latest_invoice.status = "open";
    h.subscription.latest_invoice.amount_paid = 0;
    h.subscription.latest_invoice.amount_remaining = 999;
    await expect(h.service.cancel("wallet", { requestId })).resolves.toMatchObject({ cancelAtPeriodEnd: true, paidUntil: null });
    const persisted = h.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE candidate_subscriptions"));
    expect(persisted?.[1]?.[1]).toBe("expired");
  });

  it.each([0, 2])("refuses ambiguous or missing agreements (%s)", async count => {
    const h = cancellationHarness();
    h.agreements.splice(0, 1, ...Array.from({ length: count }, (_, index) => ({ checkout_id: `cs_${index}` })));
    await expect(h.service.cancel("wallet", { requestId })).rejects.toThrow("unique membership");
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
