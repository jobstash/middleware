import Stripe from "stripe";
import {
  CandidateSubscriptionState,
  readStripeSubscription,
} from "./stripe-subscription";

interface DiscountFixture {
  id: string;
  customer: string;
  subscription: string;
  subscription_item: null;
  invoice: null;
  invoice_item: null;
  start: number;
  end: number | null;
  coupon: {
    id: string;
    livemode: boolean;
    amount_off: null;
    percent_off: number;
    duration: "once" | "repeating" | "forever";
    applies_to?: { products: string[] };
  };
}

interface SubscriptionFixture {
  id: string;
  livemode: boolean;
  customer: string;
  discounts: DiscountFixture[];
  status: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  metadata: { candidateId: string; purpose: string };
  items: {
    data: {
      id: string;
      quantity: number;
      current_period_start: number;
      current_period_end: number;
      price: {
        id: string;
        livemode: boolean;
        product: string;
        currency: string;
        unit_amount: number;
        recurring: { interval: string; interval_count: number };
      };
    }[];
  };
  latest_invoice: {
    id: string;
    livemode: boolean;
    customer: string;
    parent: {
      type: string;
      subscription_details: { subscription: string };
    };
    discounts: DiscountFixture[];
    status: string;
    currency: string;
    amount_paid: number;
    amount_due: number;
    total: number;
    amount_remaining: number;
    lines: {
      has_more: boolean;
      data: {
        quantity: number;
        id: string;
        livemode: boolean;
        invoice: string;
        subscription: string | null;
        currency: string;
        amount: number;
        discount_amounts: {
          amount: number;
          discount: string | DiscountFixture;
        }[];
        parent: {
          type: string;
          subscription_item_details: {
            subscription: string;
            subscription_item: string;
            proration: boolean;
          };
        };
        pricing: { price_details: { price: string } };
        period: { start: number; end: number };
      }[];
    };
  };
}
const now = Date.UTC(2026, 9, 9);
const start = now / 1000 - 3600;
const end = now / 1000 + 86400;
function subscription(): SubscriptionFixture {
  // Only the provider fields consumed by the parser are included in this unit test.
  return {
    id: "sub_owned",
    livemode: true,
    customer: "cus_owned",
    discounts: [],
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    metadata: { candidateId: "123", purpose: "recruiters-membership" },
    items: {
      data: [
        {
          id: "si_owned",
          quantity: 1,
          current_period_start: start,
          current_period_end: end,
          price: {
            id: "price_live",
            livemode: true,
            product: "prod_month",
            currency: "usd",
            unit_amount: 999,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    latest_invoice: {
      id: "in_paid",
      livemode: true,
      customer: "cus_owned",
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_owned" },
      },
      discounts: [],
      status: "paid",
      currency: "usd",
      amount_paid: 999,
      amount_due: 999,
      total: 999,
      amount_remaining: 0,
      lines: {
        has_more: false,
        data: [
          {
            id: "il_owned",
            livemode: true,
            invoice: "in_paid",
            subscription: null,
            currency: "usd",
            amount: 999,
            discount_amounts: [],
            parent: {
              type: "subscription_item_details",
              subscription_item_details: {
                subscription: "sub_owned",
                subscription_item: "si_owned",
                proration: false,
              },
            },
            quantity: 1,
            pricing: { price_details: { price: "price_live" } },
            period: { start, end },
          },
        ],
      },
    },
  };
}

function discounted(
  value: SubscriptionFixture,
  percentOff: number,
  duration: DiscountFixture["coupon"]["duration"],
): SubscriptionFixture {
  const coupon: DiscountFixture = {
    id: "di_owned",
    customer: "cus_owned",
    subscription: "sub_owned",
    subscription_item: null,
    invoice: null,
    invoice_item: null,
    start,
    end: duration === "repeating" ? end - 3600 : null,
    coupon: {
      id: "coupon_owned",
      livemode: true,
      amount_off: null,
      percent_off: percentOff,
      duration,
      applies_to: { products: [value.items.data[0].price.product] },
    },
  };
  value.discounts = [coupon];
  value.latest_invoice.discounts = [coupon];
  const line = value.latest_invoice.lines.data[0];
  const amount = Math.round((line.amount * percentOff) / 100);
  line.discount_amounts = [{ amount, discount: coupon.id }];
  value.latest_invoice.amount_paid = line.amount - amount;
  value.latest_invoice.amount_due = line.amount - amount;
  value.latest_invoice.total = line.amount - amount;
  return value;
}

function yearly(): SubscriptionFixture {
  const value = subscription();
  value.items.data[0].price.unit_amount = 9590;
  value.items.data[0].price.recurring.interval = "year";
  value.items.data[0].price.product = "prod_year";
  value.latest_invoice.lines.data[0].amount = 9590;
  value.latest_invoice.amount_paid = 9590;
  value.latest_invoice.amount_due = 9590;
  value.latest_invoice.total = 9590;
  return value;
}

function parse(value: unknown, owner = "123"): CandidateSubscriptionState {
  // The SDK object has additional unrelated fields, deliberately absent in unit tests.
  const providerValue = value as unknown as Stripe.Subscription;
  return readStripeSubscription(providerValue, "price_live", owner, now);
}

describe("live Stripe membership state", () => {
  it("accepts only the owned paid live monthly subscription", () => {
    expect(parse(subscription())).toEqual({
      status: "active",
      paidUntil: new Date(end * 1000).toISOString(),
      cancelledAt: null,
      billingState: "agreement",
      interval: "month",
      discount: null,
    });
  });
  it("rejects test mode and another account", () => {
    const value = subscription();
    value.livemode = false;
    expect(() => parse(value)).toThrow("account binding");
    expect(() => parse(subscription(), "456")).toThrow("account binding");
  });
  it("rejects a different price, currency, interval or trial", () => {
    const price = subscription();
    price.items.data[0].price.unit_amount = 1;
    expect(() => parse(price)).toThrow("USD9.99");
    const interval = subscription();
    interval.items.data[0].price.recurring.interval = "year";
    expect(() => parse(interval)).toThrow("USD9.99");
    const currency = subscription();
    currency.items.data[0].price.currency = "eur";
    expect(() => parse(currency)).toThrow("USD9.99");
    const trial = { ...subscription(), trial_end: end };
    // A deliberately non-null provider trial boundary must be refused.
    expect(() =>
      readStripeSubscription(
        trial as unknown as Stripe.Subscription,
        "price_live",
        "123",
        now,
      ),
    ).toThrow("without a trial");
  });
  it.each(["canceled", "past_due", "unpaid", "paused", "incomplete_expired"])(
    "does not retain access after %s",
    status => {
      const value = subscription();
      value.status = status;
      expect(parse(value).status).toBe("expired");
    },
  );
  it.each(["past_due", "unpaid", "paused", "incomplete"])(
    "keeps %s billing agreements nonterminal even without paid access",
    status => {
      const value = subscription();
      value.status = status;
      expect(parse(value).billingState).toBe("agreement");
      expect(parse(value).status).not.toBe("active");
    },
  );
  it.each(["canceled", "incomplete_expired"])(
    "retires only terminal provider state %s",
    status => {
      const value = { ...subscription(), status, latest_invoice: null };
      expect(parse(value)).toMatchObject({
        billingState: "terminal",
        status: "expired",
        paidUntil: null,
      });
    },
  );
  it("does not turn historical payment into renewal access", () => {
    const value = subscription();
    value.latest_invoice.lines.data[0].period.end = now / 1000 - 1;
    expect(parse(value).status).toBe("expired");
    value.latest_invoice.lines.data[0].period.end = end;
    value.latest_invoice.status = "open";
    expect(parse(value).status).toBe("expired");
  });
  it("rejects unpaid, wrong-price and inconsistent zero-paid invoices", () => {
    const unpaid = subscription();
    unpaid.latest_invoice.amount_remaining = 999;
    expect(parse(unpaid).status).toBe("expired");
    const wrong = subscription();
    wrong.latest_invoice.lines.data[0].pricing.price_details.price =
      "price_foreign";
    expect(parse(wrong).status).toBe("expired");
    const free = subscription();
    free.latest_invoice.amount_paid = 0;
    expect(parse(free).status).toBe("expired");
  });
  it("enforces expiry at the boundary", () => {
    const value = subscription();
    value.items.data[0].current_period_end = now / 1000;
    expect(parse(value).status).toBe("expired");
  });
  it("retains paid access and its end date when renewal is cancelled", () => {
    const value = subscription();
    value.cancel_at_period_end = true;
    value.canceled_at = now / 1000;
    expect(parse(value)).toEqual({
      status: "active",
      paidUntil: new Date(end * 1000).toISOString(),
      cancelledAt: new Date(now).toISOString(),
      billingState: "agreement",
      interval: "month",
      discount: null,
    });
  });
  it("does not present a resumed agreement as still scheduled for cancellation", () => {
    const value = subscription();
    value.canceled_at = now / 1000 - 100;
    expect(parse(value).cancelledAt).toBeNull();
  });
  it("accepts the exact yearly amount and rejects other yearly prices", () => {
    expect(parse(yearly())).toMatchObject({
      status: "active",
      interval: "year",
      discount: null,
    });
    const value = yearly();
    value.items.data[0].price.unit_amount = 9591;
    expect(() => parse(value)).toThrow("USD95.90");
  });
  it.each(["month", "year"])(
    "accepts an owned paid zero-total 100 percent forever %s invoice",
    interval => {
      const value = discounted(
        interval === "month" ? subscription() : yearly(),
        100,
        "forever",
      );
      expect(parse(value)).toMatchObject({
        status: "active",
        interval,
        paidUntil: new Date(end * 1000).toISOString(),
        discount: { percentOff: 100, endsAt: null },
      });
    },
  );
  it("accepts an unrestricted forever coupon", () => {
    const value = discounted(yearly(), 100, "forever");
    delete value.discounts[0].coupon.applies_to;
    expect(parse(value).status).toBe("active");
  });
  it("returns the paid period end for a scoped 70 percent once offer", () => {
    expect(parse(discounted(subscription(), 70, "once"))).toMatchObject({
      status: "active",
      discount: {
        percentOff: 70,
        endsAt: new Date(end * 1000).toISOString(),
      },
    });
  });
  it("accepts a customer-specific finite 100 percent monthly offer", () => {
    expect(parse(discounted(subscription(), 100, "once")).status).toBe("active");
  });
  it.each(["incomplete", "past_due", "unpaid", "paused", "canceled"])(
    "never grants discounted access for %s",
    status => {
      const value = discounted(subscription(), 100, "forever");
      value.status = status;
      expect(parse(value).status).not.toBe("active");
    },
  );
  it("uses the provider end for a scoped repeating offer", () => {
    const value = discounted(subscription(), 70, "repeating");
    expect(parse(value).discount).toEqual({
      percentOff: 70,
      endsAt: new Date((end - 3600) * 1000).toISOString(),
    });
    value.discounts[0].end = null;
    expect(() => parse(value)).toThrow("discount policy");
  });
  it.each(["once", "repeating"] as const)(
    "rejects %s discounts without hydrated monthly-only scope",
    duration => {
      const missing = discounted(subscription(), 70, duration);
      delete missing.discounts[0].coupon.applies_to;
      expect(() => parse(missing)).toThrow("discount policy");
      const broad = discounted(subscription(), 70, duration);
      broad.discounts[0].coupon.applies_to = {
        products: ["prod_month", "prod_year"],
      };
      expect(() => parse(broad)).toThrow("discount policy");
      expect(() => parse(discounted(yearly(), 70, duration))).toThrow(
        "discount policy",
      );
    },
  );
  it("resolves a line discount against its separately hydrated invoice coupon", () => {
    const value = discounted(subscription(), 70, "once");
    const unexpanded = {
      ...value.discounts[0],
      coupon: { ...value.discounts[0].coupon },
    };
    delete unexpanded.coupon.applies_to;
    value.latest_invoice.lines.data[0].discount_amounts[0].discount = unexpanded;
    expect(parse(value).status).toBe("active");
  });
  it("rejects foreign or unexpanded coupon evidence", () => {
    const foreign = discounted(subscription(), 100, "forever");
    foreign.discounts[0].customer = "cus_foreign";
    expect(() => parse(foreign)).toThrow("discount policy");
    const missing = discounted(subscription(), 100, "forever");
    missing.discounts = [];
    missing.latest_invoice.discounts = [];
    expect(() => parse(missing)).toThrow("discount evidence");
  });
  it("does not grant access for an open zero-total or underpaid invoice", () => {
    const free = discounted(subscription(), 100, "forever");
    free.latest_invoice.status = "open";
    expect(parse(free).status).toBe("expired");
    const reduced = discounted(subscription(), 70, "once");
    reduced.latest_invoice.amount_paid = 0;
    expect(parse(reduced).status).toBe("expired");
    const unverified = subscription();
    unverified.latest_invoice.amount_paid = 0;
    unverified.latest_invoice.amount_due = 0;
    unverified.latest_invoice.total = 0;
    expect(parse(unverified).status).toBe("expired");
  });
  it("rejects an incorrect discount amount and historical once discount", () => {
    const incorrect = discounted(subscription(), 100, "forever");
    incorrect.latest_invoice.lines.data[0].discount_amounts[0].amount = 998;
    expect(() => parse(incorrect)).toThrow("discount policy");
    const historical = discounted(subscription(), 70, "once");
    historical.discounts[0].start = start - 1;
    expect(() => parse(historical)).toThrow("discount policy");
  });
  it.each([
    (value: SubscriptionFixture) => {
      value.latest_invoice.customer = "cus_foreign";
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.parent.subscription_details.subscription = "sub_other";
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].parent.subscription_item_details.subscription =
        "sub_other";
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].parent.subscription_item_details.subscription_item =
        "si_other";
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].livemode = false;
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].invoice = "in_other";
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].parent.subscription_item_details.proration =
        true;
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].period.start = start - 1;
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.data[0].period.end = end + 1;
    },
    (value: SubscriptionFixture) => {
      value.latest_invoice.lines.has_more = true;
    },
  ])("requires matching invoice and line ownership and periods", mutate => {
    const value = subscription();
    mutate(value);
    expect(parse(value).status).toBe("expired");
    expect(parse(value).paidUntil).toBeNull();
  });
});
