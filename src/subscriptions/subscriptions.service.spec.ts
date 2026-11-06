jest.mock("src/user/user.service", () => ({ UserService: class {} }));
jest.mock("src/auth/profile/profile.service", () => ({ ProfileService: class {} }));

import { SubscriptionsService } from "./subscriptions.service";

describe("subscription renewal reminders", () => {
  const originalOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
  beforeEach(() => {
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    jest.useFakeTimers().setSystemTime(new Date("2026-11-06T08:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalOwner === undefined) delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
    else process.env.MIDDLEWARE_SCHEDULE_OWNER = originalOwner;
  });

  function fixture(overrides: Record<string, unknown> = {}) {
    const subscription = {
      id: "subscription", tier: "starter", status: "active", duration: "monthly",
      veri: null, externalId: null, veriPayg: false, stashPool: false,
      stashAlert: false, atsIntegration: false, jobPromotions: 0, totalSeats: 1,
      extraSeats: 0, expired: false, pendingChanges: null, quota: [],
      createdTimestamp: Date.parse("2026-10-06T08:00:00Z"),
      expiryTimestamp: Date.parse("2026-11-06T08:00:00Z"), ...overrides,
    };
    const ownerLookup = jest.fn().mockResolvedValue("owner@example.test");
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const service = Object.assign(Object.create(SubscriptionsService.prototype), {
      subscriptions: { getRenewalSubscriptions: jest.fn().mockResolvedValue([
        { orgId: "org", ownerWallet: "wallet", subscription },
      ]) },
      configService: { get: () => "production" },
      getSubscriptionOwnerEmail: ownerLookup,
      mailService: { sendEmail }, from: "sender@example.test",
      logger: { log: jest.fn(), warn: jest.fn() },
    }) as SubscriptionsService;
    return { service, ownerLookup, sendEmail };
  }

  it.each([
    { status: "inactive" },
    { tier: "growth" },
    { expiryTimestamp: Date.parse("2025-11-06T08:00:00Z") },
    { expiryTimestamp: Date.parse("2026-11-07T08:00:00Z") },
  ])("does not look up or notify owners of ineligible subscriptions: %j", async overrides => {
    const { service, ownerLookup, sendEmail } = fixture(overrides);
    await service.sendSubscriptionRenewalEmails();
    expect(ownerLookup).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends an expiring trial reminder using the scheduler's Berlin calendar day", async () => {
    const { service, sendEmail } = fixture({
      expiryTimestamp: Date.parse("2026-11-05T23:30:00Z"),
    });
    await service.sendSubscriptionRenewalEmails();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
