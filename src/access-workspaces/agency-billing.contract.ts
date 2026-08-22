import Stripe from "stripe";

export const AGENCY_STRIPE_PLAN = Object.freeze({
  lookupKey: "jobstash_agency_monthly",
  unitAmount: 29_900,
  quantity: 1,
  currency: "usd",
  interval: "month",
} as const);

export interface AgencyPlanEvidence {
  lookupKey: typeof AGENCY_STRIPE_PLAN.lookupKey;
  priceId: string;
  unitAmount: typeof AGENCY_STRIPE_PLAN.unitAmount;
  quantity: typeof AGENCY_STRIPE_PLAN.quantity;
  currency: typeof AGENCY_STRIPE_PLAN.currency;
  interval: typeof AGENCY_STRIPE_PLAN.interval;
}

export const agencyPlanEvidence = (
  price: Stripe.Price,
  quantity: number | null | undefined,
  options: { requireActive?: boolean } = {},
): AgencyPlanEvidence => {
  if (
    ((options.requireActive ?? true) && price.active !== true) ||
    price.lookup_key !== AGENCY_STRIPE_PLAN.lookupKey ||
    price.type !== "recurring" ||
    price.recurring?.interval !== AGENCY_STRIPE_PLAN.interval ||
    price.recurring.interval_count !== 1 ||
    price.billing_scheme !== "per_unit" ||
    price.unit_amount !== AGENCY_STRIPE_PLAN.unitAmount ||
    price.currency.toLowerCase() !== AGENCY_STRIPE_PLAN.currency ||
    quantity !== AGENCY_STRIPE_PLAN.quantity
  ) {
    throw new Error(
      "Agency billing requires one active $299 USD monthly price at quantity one",
    );
  }

  return {
    lookupKey: AGENCY_STRIPE_PLAN.lookupKey,
    priceId: price.id,
    unitAmount: AGENCY_STRIPE_PLAN.unitAmount,
    quantity: AGENCY_STRIPE_PLAN.quantity,
    currency: AGENCY_STRIPE_PLAN.currency,
    interval: AGENCY_STRIPE_PLAN.interval,
  };
};

export const agencyEntitlementForStripeStatus = (
  status: Stripe.Subscription.Status,
): { entitlementEnabled: boolean; workspaceStatus: "active" | "cancelled" } =>
  status === "active" || status === "trialing"
    ? { entitlementEnabled: true, workspaceStatus: "active" }
    : status === "canceled"
      ? { entitlementEnabled: false, workspaceStatus: "cancelled" }
      : { entitlementEnabled: false, workspaceStatus: "active" };
