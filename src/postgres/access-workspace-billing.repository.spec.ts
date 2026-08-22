import { PostgresService } from "./postgres.service";
import { AccessWorkspaceBillingRepository } from "./access-workspace-billing.repository";

describe("AccessWorkspaceBillingRepository", () => {
  it("records one value-free before/after receipt with the entitlement change", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "f9500341-2ccd-4a1b-909a-853f66c41285",
          ownerUserId: "owner",
          status: "active",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          entitlementEnabled: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
          status: "active",
          stripeCustomerId: "cus_agency",
          stripeSubscriptionId: "sub_agency",
          entitlementEnabled: true,
        },
      ])
      .mockResolvedValueOnce([]);
    const postgres = {
      transaction: jest.fn(async callback => callback({ query })),
    } as unknown as PostgresService;
    const repository = new AccessWorkspaceBillingRepository(postgres);

    await expect(
      repository.applyEvent({
        eventId: "evt_agency",
        eventType: "checkout.session.completed",
        workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
        stripeCustomerId: "cus_agency",
        stripeSubscriptionId: "sub_agency",
        stripeStatus: "active",
        entitlementEnabled: true,
        workspaceStatus: "active",
        planEvidence: {
          lookupKey: "jobstash_agency_monthly",
          priceId: "price_agency",
          unitAmount: 29_900,
          quantity: 1,
          currency: "usd",
          interval: "month",
        },
      }),
    ).resolves.toEqual({
      applied: true,
      workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      entitlementEnabled: true,
    });
    const receipt = query.mock.calls[5];
    expect(receipt[0]).toContain("access_workspace_billing_events");
    expect(receipt[1]).toEqual([
      "evt_agency",
      "checkout.session.completed",
      "f9500341-2ccd-4a1b-909a-853f66c41285",
      "sub_agency",
      expect.stringContaining('"entitlementEnabled":false'),
      expect.stringContaining('"entitlementEnabled":true'),
      expect.stringContaining('"quantity":1'),
    ]);
    expect(JSON.stringify(receipt)).not.toContain("email");
    expect(JSON.stringify(receipt)).not.toContain("payment_method");
  });

  it("returns an existing receipt without updating the workspace again", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
          entitlementEnabled: true,
        },
      ]);
    const postgres = {
      transaction: jest.fn(async callback => callback({ query })),
    } as unknown as PostgresService;
    const repository = new AccessWorkspaceBillingRepository(postgres);

    await expect(
      repository.applyEvent({
        eventId: "evt_replay",
        eventType: "checkout.session.completed",
        stripeCustomerId: "cus_agency",
        stripeSubscriptionId: "sub_agency",
        stripeStatus: "active",
        entitlementEnabled: true,
        workspaceStatus: "active",
        planEvidence: {
          lookupKey: "jobstash_agency_monthly",
          priceId: "price_agency",
          unitAmount: 29_900,
          quantity: 1,
          currency: "usd",
          interval: "month",
        },
      }),
    ).resolves.toEqual({
      applied: false,
      workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      entitlementEnabled: true,
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("records but ignores a late event from an older subscription", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "f9500341-2ccd-4a1b-909a-853f66c41285",
          ownerUserId: "owner",
          status: "active",
          stripeCustomerId: "cus_agency",
          stripeSubscriptionId: "sub_current",
          entitlementEnabled: true,
        },
      ])
      .mockResolvedValueOnce([]);
    const postgres = {
      transaction: jest.fn(async callback => callback({ query })),
    } as unknown as PostgresService;
    const repository = new AccessWorkspaceBillingRepository(postgres);

    await expect(
      repository.applyEvent({
        eventId: "evt_old_cancelled",
        eventType: "customer.subscription.deleted",
        workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
        stripeCustomerId: "cus_agency",
        stripeSubscriptionId: "sub_old",
        stripeStatus: "canceled",
        entitlementEnabled: false,
        workspaceStatus: "cancelled",
        planEvidence: {
          lookupKey: "jobstash_agency_monthly",
          priceId: "price_agency",
          unitAmount: 29_900,
          quantity: 1,
          currency: "usd",
          interval: "month",
        },
      }),
    ).resolves.toEqual({
      applied: false,
      workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      entitlementEnabled: true,
    });

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[4][0]).toContain("access_workspace_billing_events");
    expect(query.mock.calls[4][1]).toEqual([
      "evt_old_cancelled",
      "customer.subscription.deleted",
      "f9500341-2ccd-4a1b-909a-853f66c41285",
      "sub_old",
      expect.stringContaining('"ignoredStaleSubscriptionId":"sub_old"'),
      expect.stringContaining('"quantity":1'),
    ]);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE access_workspaces"),
      ),
    ).toBe(false);
  });
});
