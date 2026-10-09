import { ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";

export interface CandidateSubscriptionState {
  status: "pending" | "active" | "expired";
  paidUntil: string | null;
  cancelledAt: string | null;
  billingState: "open" | "agreement" | "terminal";
}

/** Entitlement requires the bound live subscription and a paid invoice for this exact price. */
export function readStripeSubscription(
  subscription: Stripe.Subscription,
  priceId: string,
  owner: string,
  now = Date.now(),
): CandidateSubscriptionState {
  if (
    !subscription.livemode ||
    subscription.metadata?.candidateId !== owner ||
    subscription.metadata?.purpose !== "recruiters-membership"
  )
    throw new ServiceUnavailableException(
      "Subscription account binding does not match",
    );
  const items = subscription.items.data;
  const item = items[0];
  if (
    items.length !== 1 ||
    item.quantity !== 1 ||
    item.price.id !== priceId ||
    item.price.currency !== "usd" ||
    item.price.unit_amount !== 999 ||
    item.price.recurring?.interval !== "month" ||
    item.price.recurring.interval_count !== 1 ||
    subscription.trial_start ||
    subscription.trial_end
  )
    throw new ServiceUnavailableException(
      "Membership must be USD9.99 per month without a trial",
    );
  const invoice = subscription.latest_invoice;
  const cancelledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : null;
  if (["canceled", "incomplete_expired"].includes(subscription.status))
    return {
      status: "expired",
      paidUntil: null,
      cancelledAt,
      billingState: "terminal",
    };
  if (!invoice || typeof invoice === "string" || !invoice.livemode)
    throw new ServiceUnavailableException(
      "Live payment evidence is unavailable",
    );
  const line = invoice.lines.data.find(
    value =>
      value.pricing?.price_details?.price === priceId && value.quantity === 1,
  );
  const paid =
    invoice.status === "paid" &&
    invoice.currency === "usd" &&
    invoice.amount_paid >= 999 &&
    invoice.amount_remaining === 0 &&
    line;
  const end = Math.min(item.current_period_end, line?.period.end ?? 0) * 1000;
  const start =
    Math.max(item.current_period_start, line?.period.start ?? Infinity) * 1000;
  const active =
    subscription.status === "active" &&
    !!paid &&
    Number.isFinite(end) &&
    start <= now &&
    end > now;
  return {
    status: active
      ? "active"
      : ["incomplete", "trialing"].includes(subscription.status)
        ? "pending"
        : "expired",
    paidUntil:
      paid && Number.isFinite(end) && end > 0
        ? new Date(end).toISOString()
        : null,
    cancelledAt,
    billingState: "agreement",
  };
}
