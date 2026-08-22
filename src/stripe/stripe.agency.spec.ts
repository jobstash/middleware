import Stripe from "stripe";
import { AGENCY_STRIPE_PLAN } from "src/access-workspaces/agency-billing.contract";
import { StripeService } from "./stripe.service";

const price = (overrides: Partial<Stripe.Price> = {}): Stripe.Price =>
  ({
    id: "price_agency",
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    currency: "usd",
    lookup_key: AGENCY_STRIPE_PLAN.lookupKey,
    type: "recurring",
    unit_amount: 29_900,
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
    ...overrides,
  }) as Stripe.Price;

const subscription = (
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription =>
  ({
    id: "sub_agency",
    object: "subscription",
    customer: "cus_agency",
    status: "active",
    metadata: {
      billingContract: "access_workspace_agency_v1",
      workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
    },
    items: {
      data: [{ price: price(), quantity: 1 }],
    },
    ...overrides,
  }) as Stripe.Subscription;

const setup = (): {
  service: StripeService;
  stripe: {
    prices: { list: jest.Mock };
    checkout: { sessions: { create: jest.Mock } };
    subscriptions: { retrieve: jest.Mock };
  };
  agency: {
    getForOwner: jest.Mock;
    findBySubscription: jest.Mock;
    applyEvent: jest.Mock;
  };
} => {
  const stripe = {
    prices: { list: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { retrieve: jest.fn() },
  };
  const agency = {
    getForOwner: jest.fn(),
    findBySubscription: jest.fn(),
    applyEvent: jest.fn(),
  };
  const service = new StripeService(
    stripe as never,
    "https://admin.jobstash.example",
    {} as never,
    {} as never,
    {} as never,
    agency as never,
  );
  return { service, stripe, agency };
};

describe("StripeService Agency billing", () => {
  it("creates an exact quantity-one checkout for the workspace owner", async () => {
    const { service, stripe, agency } = setup();
    agency.getForOwner.mockResolvedValue({
      id: "f9500341-2ccd-4a1b-909a-853f66c41285",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      entitlementEnabled: false,
    });
    stripe.prices.list.mockResolvedValue({ data: [price()] });
    stripe.checkout.sessions.create.mockResolvedValue({
      id: "cs_agency",
      url: "https://checkout.stripe.test/cs_agency",
    });

    await expect(
      service.createAgencyCheckout(
        "f9500341-2ccd-4a1b-909a-853f66c41285",
        "owner",
      ),
    ).resolves.toEqual({
      id: "cs_agency",
      url: "https://checkout.stripe.test/cs_agency",
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_agency", quantity: 1 }],
        metadata: expect.objectContaining({
          action: "agency-subscription",
          billingContract: "access_workspace_agency_v1",
        }),
        subscription_data: {
          metadata: expect.objectContaining({
            workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
          }),
        },
      }),
    );
  });

  it("refuses a wrong price before creating checkout", async () => {
    const { service, stripe, agency } = setup();
    agency.getForOwner.mockResolvedValue({
      id: "f9500341-2ccd-4a1b-909a-853f66c41285",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      entitlementEnabled: false,
    });
    stripe.prices.list.mockResolvedValue({
      data: [price({ unit_amount: 19900 })],
    });

    await expect(
      service.createAgencyCheckout(
        "f9500341-2ccd-4a1b-909a-853f66c41285",
        "owner",
      ),
    ).rejects.toThrow("$299 USD monthly");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("activates from the verified subscription and records the Stripe event", async () => {
    const { service, stripe, agency } = setup();
    stripe.subscriptions.retrieve.mockResolvedValue(subscription());
    agency.applyEvent.mockResolvedValue({
      applied: true,
      workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      entitlementEnabled: true,
    });

    await service.handleCheckoutSessionCompleted(
      {
        id: "cs_agency",
        metadata: {
          action: "agency-subscription",
          billingContract: "access_workspace_agency_v1",
          workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
        },
        subscription: "sub_agency",
      } as unknown as Stripe.Checkout.Session,
      "evt_agency",
    );

    expect(agency.applyEvent).toHaveBeenCalledWith({
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
    });
  });

  it("revokes access for a canceled Agency subscription with an archived price", async () => {
    const { service, agency } = setup();
    agency.findBySubscription.mockResolvedValue({
      id: "f9500341-2ccd-4a1b-909a-853f66c41285",
    });
    agency.applyEvent.mockResolvedValue({
      applied: true,
      workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      entitlementEnabled: false,
    });
    const canceled = subscription({
      status: "canceled",
      items: {
        data: [{ price: price({ active: false }), quantity: 1 }],
      } as Stripe.ApiList<Stripe.SubscriptionItem>,
    });

    await service.handleStripeSubscriptionCanceled({
      id: "evt_agency_cancelled",
      type: "customer.subscription.deleted",
      data: { object: canceled },
    } as Stripe.CustomerSubscriptionDeletedEvent);

    expect(agency.applyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_agency_cancelled",
        workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
        stripeSubscriptionId: "sub_agency",
        stripeStatus: "canceled",
        entitlementEnabled: false,
        workspaceStatus: "cancelled",
        planEvidence: expect.objectContaining({
          priceId: "price_agency",
          unitAmount: 29_900,
          quantity: 1,
        }),
      }),
    );
  });
});
