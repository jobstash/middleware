import Stripe = require("stripe");
import { StripeService } from "./stripe.service";

function fixture(): {
  service: StripeService;
  stripe: {
    subscriptions: Record<string, jest.Mock>;
    checkout: { sessions: Record<string, jest.Mock> };
  };
  subscriptions: Record<string, jest.Mock>;
  config: Record<string, jest.Mock>;
} {
  const stripe = {
    subscriptions: {
      retrieve: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: "checkout",
          url: "https://checkout.invalid",
          amount_total: 100,
        }),
      },
    },
  };
  const subscriptions = { getSubscriptionInfoByOrgId: jest.fn() };
  const config = { get: jest.fn(() => "https://frontend.invalid") };
  const service = new StripeService(
    stripe as never,
    "https://admin.invalid",
    {} as never,
    subscriptions as never,
    config as never,
    {} as never,
  );
  jest.spyOn(service, "getProductPrices").mockResolvedValue([
    { id: "price_growth", lookup_key: "jobstash_growth" },
    { id: "price_pro", lookup_key: "jobstash_pro" },
    { id: "price_stash", lookup_key: "stash_alert" },
    { id: "price_payg", lookup_key: "veri_payg" },
  ] as Stripe.Price[]);
  return { service, stripe, subscriptions, config };
}

describe("Stripe plan decision preservation", () => {
  afterEach(() => jest.restoreAllMocks());

  it("preserves deletion/addition order and immediate billing for an upgrade", async () => {
    const { service, stripe, subscriptions } = fixture();
    subscriptions.getSubscriptionInfoByOrgId.mockResolvedValue({
      success: true,
      data: {
        tier: "growth",
        veri: null,
        stashAlert: false,
        extraSeats: 0,
        veriPayg: false,
        externalId: "sub",
      },
    });
    stripe.subscriptions.retrieve.mockResolvedValue({
      items: {
        data: [
          { id: "old_bundle", price: { lookup_key: "jobstash_growth" } },
          { id: "old_veri", price: { lookup_key: "veri_lite" } },
        ],
      },
    });
    await expect(
      service.initiateSubscriptionChange(
        "wallet",
        "owner@example.test",
        "org",
        {
          jobstash: "pro",
          veri: null,
          stashAlert: true,
          extraSeats: 2,
          paygOptIn: true,
        },
      ),
    ).resolves.toMatchObject({ success: true });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub", {
      proration_behavior: "always_invoice",
      billing_cycle_anchor: { type: "now" },
      items: [
        { id: "old_bundle", deleted: true },
        { id: "old_veri", deleted: true },
        { price: "price_pro", quantity: 3 },
        { price: "price_stash", quantity: 1 },
        { price: "price_payg" },
      ],
    });
  });

  it("retains the renewal anchor while removing optional services on a downgrade", async () => {
    const { service, stripe, subscriptions } = fixture();
    subscriptions.getSubscriptionInfoByOrgId.mockResolvedValue({
      success: true,
      data: {
        tier: "pro",
        veri: null,
        stashAlert: true,
        extraSeats: 0,
        veriPayg: true,
        externalId: "sub",
      },
    });
    stripe.subscriptions.retrieve.mockResolvedValue({
      items: {
        data: [
          { id: "old_bundle", price: { lookup_key: "jobstash_pro" } },
          { id: "stash", price: { lookup_key: "stash_alert" } },
          { id: "payg", price: { lookup_key: "veri_payg" } },
        ],
      },
    });
    await service.initiateSubscriptionChange(
      "wallet",
      "owner@example.test",
      "org",
      {
        jobstash: "growth",
        veri: null,
        stashAlert: false,
        extraSeats: 0,
        paygOptIn: false,
      },
    );
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub", {
      proration_behavior: "none",
      billing_cycle_anchor: { type: "unchanged" },
      items: [
        { id: "old_bundle", deleted: true },
        { price: "price_growth", quantity: 1 },
        { id: "stash", deleted: true },
        { id: "payg", deleted: true },
      ],
    });
  });

  it("keeps subscription redirects lazy and preserves flag encoding", async () => {
    const { service, stripe, config } = fixture();
    await service.createCheckoutSession(
      [],
      "subscription",
      "new-subscription",
      undefined,
      undefined,
      "literal flag",
    );
    expect(config.get).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          "https://admin.invalid/payment/confirmation?flag=literal flag",
        cancel_url: "https://admin.invalid?flag=literal flag",
      }),
    );
    await service.createCheckoutSession([], "payment", "job-promotion");
    expect(config.get).toHaveBeenCalledTimes(2);
    expect(stripe.checkout.sessions.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        success_url: "https://frontend.invalid/jobs",
        cancel_url: "https://frontend.invalid/jobs",
      }),
    );
  });
});
