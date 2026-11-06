jest.mock("src/user/user.service", () => ({ UserService: class {} }));
jest.mock("src/auth/profile/profile.service", () => ({
  ProfileService: class {},
}));

import { SubscriptionsService } from "./subscriptions.service";

describe("subscription renewal reminders", () => {
  const originalOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
  beforeEach(() => {
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    jest.useFakeTimers().setSystemTime(new Date("2026-11-06T08:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalOwner === undefined)
      delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
    else process.env.MIDDLEWARE_SCHEDULE_OWNER = originalOwner;
  });

  function fixture(overrides: Record<string, unknown> = {}): {
    service: SubscriptionsService;
    ownerLookup: jest.Mock;
    sendEmail: jest.Mock;
  } {
    const subscription = {
      id: "subscription",
      tier: "starter",
      status: "active",
      duration: "monthly",
      veri: null,
      externalId: null,
      veriPayg: false,
      stashPool: false,
      stashAlert: false,
      atsIntegration: false,
      jobPromotions: 0,
      totalSeats: 1,
      extraSeats: 0,
      expired: false,
      pendingChanges: null,
      quota: [],
      createdTimestamp: Date.parse("2026-10-06T08:00:00Z"),
      expiryTimestamp: Date.parse("2026-11-06T08:00:00Z"),
      ...overrides,
    };
    const ownerLookup = jest.fn().mockResolvedValue("owner@example.test");
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const service = Object.assign(
      Object.create(SubscriptionsService.prototype),
      {
        subscriptions: {
          getRenewalSubscriptions: jest
            .fn()
            .mockResolvedValue([
              { orgId: "org", ownerWallet: "wallet", subscription },
            ]),
        },
        configService: { get: () => "production" },
        getSubscriptionOwnerEmail: ownerLookup,
        mailService: { sendEmail },
        from: "sender@example.test",
        logger: { log: jest.fn(), warn: jest.fn() },
      },
    ) as SubscriptionsService;
    return { service, ownerLookup, sendEmail };
  }

  it.each([
    { status: "inactive" },
    { tier: "growth" },
    { expiryTimestamp: Date.parse("2025-11-06T08:00:00Z") },
    { expiryTimestamp: Date.parse("2026-11-07T08:00:00Z") },
  ])(
    "does not look up or notify owners of ineligible subscriptions: %j",
    async overrides => {
      const { service, ownerLookup, sendEmail } = fixture(overrides);
      await service.sendSubscriptionRenewalEmails();
      expect(ownerLookup).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    },
  );

  it("sends an expiring trial reminder using the scheduler's Berlin calendar day", async () => {
    const { service, sendEmail } = fixture({
      expiryTimestamp: Date.parse("2026-11-05T23:30:00Z"),
    });
    await service.sendSubscriptionRenewalEmails();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("metered usage authorization and quota ordering", () => {
  it.each(["starter", "growth"])(
    "keeps %s email failures nonfatal",
    async jobstash => {
      const sendEmail = jest
        .fn()
        .mockRejectedValue(new Error("mail unavailable"));
      const logger = { error: jest.fn() };
      const service = Object.assign(
        Object.create(SubscriptionsService.prototype),
        {
          mailService: { sendEmail },
          from: "sender@example.test",
          logger,
        },
      ) as SubscriptionsService;
      await expect(
        service["sendNewSubscriptionConfirmation"](
          { jobstash } as never,
          "owner@example.test",
        ),
      ).resolves.toBeUndefined();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
    },
  );

  function fixture(
    member: boolean,
    active: boolean,
    quotaId?: string,
  ): {
    service: SubscriptionsService;
    recordQuotaUsage: jest.Mock;
    recordMeteredServiceUsage: jest.Mock;
    subscription: {
      id: string;
      externalId: string;
      isActive: jest.Mock;
      canAccessService: jest.Mock;
      getOldestActiveUnfilledQuota: jest.Mock;
    };
  } {
    const recordQuotaUsage = jest.fn().mockResolvedValue(true);
    const recordMeteredServiceUsage = jest
      .fn()
      .mockResolvedValue({ success: true });
    const canAccessService = jest.fn().mockReturnValue(true);
    const getOldestActiveUnfilledQuota = jest
      .fn()
      .mockReturnValue(quotaId ? { id: quotaId } : undefined);
    const subscription = {
      id: "subscription",
      externalId: "stripe-subscription",
      isActive: jest.fn().mockReturnValue(active),
      canAccessService,
      getOldestActiveUnfilledQuota,
    };
    const service = Object.assign(
      Object.create(SubscriptionsService.prototype),
      {
        subscriptions: { recordQuotaUsage },
        userService: { isOrgMember: jest.fn().mockResolvedValue(member) },
        getSubscriptionInfoByOrgId: jest
          .fn()
          .mockResolvedValue({ success: true, data: subscription }),
        logger: { log: jest.fn(), error: jest.fn() },
      },
    ) as SubscriptionsService;
    return {
      service,
      recordQuotaUsage,
      recordMeteredServiceUsage,
      subscription,
    };
  }

  it("does not inspect subscription access or charge a nonmember", async () => {
    const f = fixture(false, true, "quota");
    await expect(
      f.service.recordMeteredServiceUsage("org", "wallet", 2, "veri", {
        recordMeteredServiceUsage: f.recordMeteredServiceUsage,
      } as never),
    ).resolves.toMatchObject({
      success: false,
      message: "Non org member cannot record metered service usage",
    });
    expect(f.subscription.isActive).not.toHaveBeenCalled();
    expect(f.recordQuotaUsage).not.toHaveBeenCalled();
    expect(f.recordMeteredServiceUsage).not.toHaveBeenCalled();
  });

  it("short-circuits inactive access before querying quota", async () => {
    const f = fixture(true, false, "quota");
    await f.service.recordMeteredServiceUsage("org", "wallet", 2, "veri", {
      recordMeteredServiceUsage: f.recordMeteredServiceUsage,
    } as never);
    expect(f.subscription.canAccessService).not.toHaveBeenCalled();
    expect(f.subscription.getOldestActiveUnfilledQuota).not.toHaveBeenCalled();
    expect(f.recordMeteredServiceUsage).not.toHaveBeenCalled();
  });

  it("records existing quota before considering pay-as-you-go", async () => {
    const f = fixture(true, true, "quota");
    await f.service.recordMeteredServiceUsage("org", "wallet", 2, "veri", {
      recordMeteredServiceUsage: f.recordMeteredServiceUsage,
    } as never);
    expect(f.recordQuotaUsage).toHaveBeenCalledWith({
      subscriptionId: "subscription",
      quotaId: "quota",
      wallet: "wallet",
      amount: 2,
      service: "veri",
    });
    expect(f.recordMeteredServiceUsage).not.toHaveBeenCalled();
  });

  it("uses pay-as-you-go only for an exhausted eligible service", async () => {
    const f = fixture(true, true);
    await f.service.recordMeteredServiceUsage("org", "wallet", 2, "veri", {
      recordMeteredServiceUsage: f.recordMeteredServiceUsage,
    } as never);
    expect(f.recordMeteredServiceUsage).toHaveBeenCalledWith(
      "stripe-subscription",
      "veri",
      2,
    );
    await expect(
      f.service.recordMeteredServiceUsage("org", "wallet", 2, "jobPromotions", {
        recordMeteredServiceUsage: f.recordMeteredServiceUsage,
      } as never),
    ).resolves.toMatchObject({ success: false });
    expect(f.recordMeteredServiceUsage).toHaveBeenCalledTimes(1);
  });
});
