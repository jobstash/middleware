import Stripe from "stripe";
import {
  AGENCY_STRIPE_PLAN,
  agencyEntitlementForStripeStatus,
  agencyPlanEvidence,
} from "./agency-billing.contract";

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

describe("Agency Stripe billing contract", () => {
  it("accepts only the exact $299 monthly quantity-one price", () => {
    expect(agencyPlanEvidence(price(), 1)).toEqual({
      lookupKey: "jobstash_agency_monthly",
      priceId: "price_agency",
      unitAmount: 29_900,
      quantity: 1,
      currency: "usd",
      interval: "month",
    });

    expect(() =>
      agencyPlanEvidence(price({ unit_amount: 29_899 }), 1),
    ).toThrow();
    expect(() => agencyPlanEvidence(price(), 2)).toThrow();
    expect(() => agencyPlanEvidence(price({ active: false }), 1)).toThrow();
    expect(
      agencyPlanEvidence(price({ active: false }), 1, {
        requireActive: false,
      }),
    ).toMatchObject({ priceId: "price_agency", quantity: 1 });
    expect(() =>
      agencyPlanEvidence(
        price({ recurring: { interval: "year", interval_count: 1 } as never }),
        1,
      ),
    ).toThrow();
  });

  it("enables access only for active or trialing subscriptions", () => {
    expect(agencyEntitlementForStripeStatus("active")).toEqual({
      entitlementEnabled: true,
      workspaceStatus: "active",
    });
    expect(agencyEntitlementForStripeStatus("trialing")).toEqual({
      entitlementEnabled: true,
      workspaceStatus: "active",
    });
    expect(agencyEntitlementForStripeStatus("past_due")).toEqual({
      entitlementEnabled: false,
      workspaceStatus: "active",
    });
    expect(agencyEntitlementForStripeStatus("canceled")).toEqual({
      entitlementEnabled: false,
      workspaceStatus: "cancelled",
    });
  });
});
