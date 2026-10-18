import { BadRequestException } from "@nestjs/common";
import Stripe from "stripe";

export const CANDIDATE_STRIPE_PURPOSE = "recruiters-rip-candidate-v1";
export const CANDIDATE_PRICES = {
  month: { amount: "9.99", currency: "USD", interval: "month" },
  year: { amount: "95.90", currency: "USD", interval: "year" },
} as const;
export type CandidateBillingInterval = keyof typeof CANDIDATE_PRICES;
export interface CandidateStripeBinding {
  charge_id: string;
  user_node_id: string;
  interval: CandidateBillingInterval;
  checkout_request_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  stripe_subscription_id: string | null;
  provider_state: CandidateStripeState | null;
  paid_until: string | Date | null;
}
export interface CandidateStripeState {
  status: "pending" | "active" | "expired";
  paidUntil: string | null;
  stripeStatus: string;
  terminal: boolean;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  discount: { percentOff: number; endsAt: string | null } | null;
}
export const stripeId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : value?.id ?? null;
function invalid(message: string): never { throw new BadRequestException(message); }
export function stripeTimestamp(value: number | null | undefined): string | null {
  return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value * 1000).getTime())
    ? new Date(value * 1000).toISOString() : null;
}
export function validateCandidatePrice(price: Stripe.Price, interval: CandidateBillingInterval): string {
  const product = price.product;
  if (!price.active || price.type !== "recurring" || price.currency !== "usd" ||
      price.unit_amount !== (interval === "month" ? 999 : 9590) ||
      price.billing_scheme !== "per_unit" || price.recurring?.interval !== interval ||
      price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed" ||
      price.transform_quantity || !product || typeof product === "string" ||
      "deleted" in product || !product.active || product.metadata.purpose !== CANDIDATE_STRIPE_PURPOSE)
    invalid("Candidate subscription price does not match");
  return stripeId(product)!;
}
export function validateCandidateMetadata(metadata: Stripe.Metadata | null, binding: CandidateStripeBinding): void {
  if (metadata?.purpose !== CANDIDATE_STRIPE_PURPOSE ||
      metadata.candidateId !== String(binding.user_node_id) ||
      metadata.checkoutRequestId !== binding.checkout_request_id || metadata.interval !== binding.interval)
    invalid("Candidate subscription owner metadata does not match checkout");
}
export function validateCandidateSession(session: Stripe.Checkout.Session, binding: CandidateStripeBinding): void {
  validateCandidateMetadata(session.metadata, binding);
  const items = session.line_items;
  if (session.id !== binding.charge_id || session.mode !== "subscription" ||
      session.client_reference_id !== String(binding.user_node_id) ||
      stripeId(session.customer) !== binding.stripe_customer_id || session.currency !== "usd" ||
      !items || items.has_more || items.data.length !== 1 || items.data[0].quantity !== 1 ||
      items.data[0].price?.id !== binding.stripe_price_id)
    invalid("Candidate checkout binding does not match");
  if (binding.stripe_subscription_id && stripeId(session.subscription) !== binding.stripe_subscription_id)
    invalid("Candidate checkout subscription does not match");
}
function subscriptionDiscount(subscription: Stripe.Subscription, binding: CandidateStripeBinding,
  product: string, periodEnd: string): CandidateStripeState["discount"] {
  let multiplier = 1;
  let end: string | null = null;
  let found = false;
  const discounts = [...subscription.discounts, ...subscription.items.data[0].discounts];
  for (const discount of discounts) {
    if (typeof discount === "string" || !discount.coupon)
      invalid("Candidate subscription discount was not expanded");
    if (!stripeTimestamp(discount.start) || !["once", "repeating", "forever"].includes(discount.coupon.duration))
      invalid("Candidate subscription discount is invalid");
    if (discount.end && discount.end * 1000 <= Date.now()) continue;
    if (discount.start * 1000 > Date.now()) continue;
    const coupon = discount.coupon;
    if (coupon.percent_off != null && coupon.duration !== "forever" &&
        (binding.interval !== "month" || coupon.applies_to?.products?.length !== 1 ||
          coupon.applies_to.products[0] !== product))
      invalid("Finite candidate discounts must be restricted to the monthly product");
    if (coupon.applies_to?.products && !coupon.applies_to.products.includes(product))
      invalid("Candidate subscription discount product does not match");
    if (coupon.percent_off == null) continue;
    if (!Number.isFinite(coupon.percent_off) || coupon.percent_off <= 0 || coupon.percent_off > 100)
      invalid("Candidate subscription discount is invalid");
    const expires = coupon.duration === "once" ? periodEnd :
      coupon.duration === "forever" ? null : stripeTimestamp(discount.end);
    if (coupon.duration === "repeating" && !expires)
      invalid("Candidate subscription discount expiry is unavailable");
    multiplier *= 1 - coupon.percent_off / 100;
    if (expires && (!end || expires < end)) end = expires;
    found = true;
  }
  return found ? { percentOff: Math.round((1 - multiplier) * 10000) / 100, endsAt: end } : null;
}
/** Provider reads, not event payloads or return URLs, supply every entitlement field. */
export function candidateStripeState(subscription: Stripe.Subscription, binding: CandidateStripeBinding): CandidateStripeState {
  validateCandidateMetadata(subscription.metadata, binding);
  const items = subscription.items;
  if (stripeId(subscription.customer) !== binding.stripe_customer_id ||
      (binding.stripe_subscription_id && subscription.id !== binding.stripe_subscription_id) ||
      !items || items.has_more || items.data.length !== 1 || items.data[0].quantity !== 1 ||
      items.data[0].price.id !== binding.stripe_price_id)
    invalid("Candidate subscription binding does not match checkout");
  const item = items.data[0];
  const product = validateCandidatePrice(item.price, binding.interval);
  const start = stripeTimestamp(item.current_period_start);
  const end = stripeTimestamp(item.current_period_end);
  if (!start || !end || end <= start) invalid("Candidate subscription period is invalid");
  const cancelAt = stripeTimestamp(subscription.cancel_at);
  const paidUntil = cancelAt && cancelAt < end ? cancelAt : end;
  const invoice = subscription.latest_invoice;
  const paid = invoice && typeof invoice !== "string" && invoice.status === "paid" &&
    invoice.currency === "usd" && stripeId(invoice.customer) === binding.stripe_customer_id &&
    stripeId(invoice.parent?.subscription_details?.subscription) === subscription.id;
  const terminal = ["canceled", "incomplete_expired"].includes(subscription.status);
  const active = subscription.status === "active" && !subscription.pause_collection && !!paid &&
    Date.parse(start) <= Date.now() && Date.parse(paidUntil) > Date.now();
  return {
    status: active ? "active" : subscription.status === "incomplete" ? "pending" : "expired",
    paidUntil,
    stripeStatus: subscription.status,
    terminal,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelledAt: stripeTimestamp(subscription.canceled_at),
    discount: subscriptionDiscount(subscription, binding, product, end),
  };
}
