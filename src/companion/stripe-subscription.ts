import { ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";

export interface CandidateSubscriptionState {
  status: "pending" | "active" | "expired";
  paidUntil: string | null;
  cancelledAt: string | null;
  billingState: "open" | "agreement" | "terminal";
  interval: "month" | "year";
  discount: { percentOff: number; endsAt: string | null } | null;
}

function providerId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

function timestamp(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

/** Coupon scope must come from the hydrated provider object, never metadata. */
function invoiceDiscount(
  subscription: Stripe.Subscription,
  invoice: Stripe.Invoice,
  line: Stripe.InvoiceLineItem,
  item: Stripe.SubscriptionItem,
  interval: CandidateSubscriptionState["interval"],
): CandidateSubscriptionState["discount"] {
  const amounts = line.discount_amounts ?? [];
  if (amounts.length === 0) return null;
  if (amounts.length !== 1)
    throw new ServiceUnavailableException(
      "Membership discount evidence is unavailable",
    );
  const applied = amounts[0];
  const discountId = providerId(applied.discount);
  const discount =
    [
      ...(invoice.discounts ?? []),
      ...(line.discounts ?? []),
      ...(item.discounts ?? []),
      ...(subscription.discounts ?? []),
    ].find(value => typeof value !== "string" && value.id === discountId) ??
    (typeof applied.discount !== "string" ? applied.discount : undefined);
  if (!discount || typeof discount === "string" || !("end" in discount) || discount.deleted)
    throw new ServiceUnavailableException(
      "Membership discount evidence is unavailable",
    );
  const coupon = discount.coupon;
  const percentOff = coupon?.percent_off;
  const productId = providerId(item.price.product);
  const products = coupon?.applies_to?.products;
  const finite = coupon?.duration !== "forever";
  if (
    !coupon?.livemode ||
    coupon.amount_off !== null ||
    typeof percentOff !== "number" ||
    !Number.isFinite(percentOff) ||
    percentOff <= 0 ||
    percentOff > 100 ||
    !["once", "repeating", "forever"].includes(coupon.duration) ||
    !productId ||
    (products !== undefined && !products.includes(productId)) ||
    (finite &&
      (interval !== "month" ||
        products?.length !== 1 ||
        products[0] !== productId)) ||
    (discount.customer !== null &&
      providerId(discount.customer) !== providerId(subscription.customer)) ||
    (discount.subscription !== null &&
      discount.subscription !== subscription.id) ||
    (discount.subscription_item !== null &&
      discount.subscription_item !== item.id) ||
    (discount.invoice !== null && discount.invoice !== invoice.id) ||
    (discount.invoice_item !== null && discount.invoice_item !== line.id) ||
    !timestamp(discount.start) ||
    discount.start >= line.period.end ||
    (coupon.duration === "once" && discount.start < line.period.start) ||
    (coupon.duration === "repeating" &&
      (!timestamp(discount.end ?? 0) ||
        discount.end! <= discount.start ||
        discount.end! <= line.period.start)) ||
    applied.amount !== Math.round((item.price.unit_amount! * percentOff) / 100)
  )
    throw new ServiceUnavailableException(
      "Membership discount policy does not match",
    );
  return {
    percentOff,
    endsAt:
      coupon.duration === "forever"
        ? null
        : new Date(
            (coupon.duration === "once" ? line.period.end : discount.end!) * 1000,
          ).toISOString(),
  };
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
  const interval = item?.price.recurring?.interval;
  const amount = interval === "month" ? 999 : 9590;
  if (
    items.length !== 1 ||
    !item.id ||
    item.quantity !== 1 ||
    item.price.id !== priceId ||
    !item.price.livemode ||
    item.price.currency !== "usd" ||
    !["month", "year"].includes(interval ?? "") ||
    item.price.unit_amount !== amount ||
    item.price.recurring?.interval_count !== 1 ||
    subscription.trial_start ||
    subscription.trial_end
  )
    throw new ServiceUnavailableException(
      "Membership must be USD9.99 per month or USD95.90 per year without a trial",
    );
  // The allowed cadence has been checked above, independently of current config.
  const billingInterval = interval as CandidateSubscriptionState["interval"];
  const invoice = subscription.latest_invoice;
  const cancelledAt =
    subscription.canceled_at &&
    (subscription.cancel_at_period_end || subscription.status === "canceled")
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null;
  if (["canceled", "incomplete_expired"].includes(subscription.status))
    return {
      status: "expired",
      paidUntil: null,
      cancelledAt,
      billingState: "terminal",
      interval: billingInterval,
      discount: null,
    };
  if (!invoice || typeof invoice === "string" || !invoice.livemode)
    throw new ServiceUnavailableException(
      "Live payment evidence is unavailable",
    );
  const customerId = providerId(subscription.customer);
  const lines = invoice.lines.data.filter(
    value =>
      value.pricing?.price_details?.price === priceId && value.quantity === 1,
  );
  const line = lines.length === 1 ? lines[0] : undefined;
  const parent = line?.parent?.subscription_item_details;
  const bound =
    !!customerId &&
    providerId(invoice.customer) === customerId &&
    invoice.parent?.type === "subscription_details" &&
    providerId(invoice.parent.subscription_details?.subscription) ===
      subscription.id &&
    !invoice.lines.has_more &&
    line?.livemode === true &&
    line.invoice === invoice.id &&
    providerId(line.subscription) === subscription.id &&
    line.parent?.type === "subscription_item_details" &&
    parent?.subscription === subscription.id &&
    parent.subscription_item === item.id &&
    parent.proration === false &&
    line.currency === "usd" &&
    line.amount === amount &&
    timestamp(item.current_period_start) &&
    timestamp(item.current_period_end) &&
    item.current_period_start < item.current_period_end &&
    line.period.start === item.current_period_start &&
    line.period.end === item.current_period_end;
  const discount =
    bound && line
      ? invoiceDiscount(subscription, invoice, line, item, billingInterval)
      : null;
  const net = amount - (line?.discount_amounts?.[0]?.amount ?? 0);
  const paid =
    !!bound &&
    invoice.status === "paid" &&
    invoice.currency === "usd" &&
    Number.isSafeInteger(invoice.total) &&
    invoice.total >= net &&
    invoice.amount_due === invoice.total &&
    invoice.amount_paid === invoice.total &&
    invoice.amount_remaining === 0 &&
    (invoice.total > 0 || discount?.percentOff === 100);
  const end = bound ? item.current_period_end * 1000 : 0;
  const start = item.current_period_start * 1000;
  const active =
    subscription.status === "active" && paid && start <= now && end > now;
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
    interval: billingInterval,
    discount: paid ? discount : null,
  };
}
