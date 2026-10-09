import Stripe from "stripe";
import {
  CandidateSubscriptionState,
  readStripeSubscription,
} from "./stripe-subscription";

interface SubscriptionFixture {
  id: string;
  livemode: boolean;
  status: string;
  canceled_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  metadata: { candidateId: string; purpose: string };
  items: {
    data: {
      quantity: number;
      current_period_start: number;
      current_period_end: number;
      price: {
        id: string;
        currency: string;
        unit_amount: number;
        recurring: { interval: string; interval_count: number };
      };
    }[];
  };
  latest_invoice: {
    id: string;
    livemode: boolean;
    status: string;
    currency: string;
    amount_paid: number;
    amount_remaining: number;
    lines: {
      data: {
        quantity: number;
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
    status: "active",
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    metadata: { candidateId: "123", purpose: "recruiters-membership" },
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: start,
          current_period_end: end,
          price: {
            id: "price_live",
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
      status: "paid",
      currency: "usd",
      amount_paid: 999,
      amount_remaining: 0,
      lines: {
        data: [
          {
            quantity: 1,
            pricing: { price_details: { price: "price_live" } },
            period: { start, end },
          },
        ],
      },
    },
  };
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
  it("rejects unpaid, wrong-price and zero-cost invoice evidence", () => {
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
});
