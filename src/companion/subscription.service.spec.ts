import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { SubscriptionService } from "./subscription.service";

interface BillingHarness {
  service: SubscriptionService;
  query: jest.Mock<Promise<Record<string, unknown>[]>, [string, unknown[]?]>;
  retrieve: jest.Mock;
  create: jest.Mock;
}

function billing(): BillingHarness {
  const query = jest.fn<
    Promise<Record<string, unknown>[]>,
    [string, unknown[]?]
  >();
  const retrieve = jest.fn();
  const create = jest.fn();
  const retrievePrice = jest.fn().mockResolvedValue({
    livemode: true,
    active: true,
    currency: "usd",
    unit_amount: 999,
    recurring: { interval: "month", interval_count: 1 },
  });
  // These DI doubles implement only the database/provider paths under test.
  const manager = { query } as unknown as EntityManager;
  const db = {
    query,
    transaction: <T>(work: (value: EntityManager) => Promise<T>) =>
      work(manager),
  } as unknown as PostgresService;
  const stripe = {
    checkout: { sessions: { retrieve, create } },
    prices: { retrieve: retrievePrice },
  } as unknown as Stripe;
  const service = new SubscriptionService(
    db,
    new ConfigService({
      STRIPE_CANDIDATE_PRICE_ID: "price_live",
      ORG_ADMIN_DOMAIN: "https://admin.jobstash.xyz",
      RECRUITERS_PUBLIC_ORIGIN: "https://recruiters.rip",
    }),
    stripe,
  );
  return { service, query, retrieve, create };
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
    });
    const checkout = create.mock.calls[0][0];
    expect(checkout.success_url).toBe(
      "https://recruiters.rip/onboarding/membership/return",
    );
    expect(checkout.cancel_url).toBe(
      "https://recruiters.rip/onboarding/membership/return",
    );
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
    const now = Math.floor(Date.now() / 1000);
    const subscription = {
      id: "sub_original",
      livemode: true,
      status: "past_due",
      canceled_at: null,
      trial_start: null,
      trial_end: null,
      metadata: { candidateId: "123", purpose: "recruiters-membership" },
      items: {
        data: [
          {
            quantity: 1,
            current_period_start: now - 100,
            current_period_end: now + 86400,
            price: {
              id: "price_live",
              currency: "usd",
              unit_amount: 999,
              recurring: { interval: "month", interval_count: 1 },
            },
          },
        ],
      },
      latest_invoice: {
        livemode: true,
        status: "open",
        currency: "usd",
        amount_paid: 0,
        amount_remaining: 999,
        lines: {
          data: [
            {
              quantity: 1,
              pricing: { price_details: { price: "price_live" } },
              period: { start: now - 100, end: now + 86400 },
            },
          ],
        },
      },
    };
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
      };
    });
    await service.refresh("123");
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve.mock.calls[0][0]).toBe("cs_current");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
      true,
    );
  });
});
