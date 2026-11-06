import "dotenv/config";
import { parseArgs } from "node:util";
import Stripe = require("stripe");

const PURPOSE = "recruiters-rip-candidate-v1";
const OFFERS = {
  month: {
    amount: 999,
    product: "recruiters_rip_candidate_month_v1",
    lookup: "recruiters_rip_candidate_usd_month_v1",
  },
  year: {
    amount: 9590,
    product: "recruiters_rip_candidate_year_v1",
    lookup: "recruiters_rip_candidate_usd_year_v1",
  },
} as const;
type Interval = keyof typeof OFFERS;
type Environment = Record<string, string | undefined>;

export const HELP = `Candidate Stripe offers (operator only; writes require --execute)
  node -r ts-node/register scripts/candidate-stripe-offers.ts setup --execute
  node -r ts-node/register scripts/candidate-stripe-offers.ts promo (--customer cus_ID | --shared) --duration month|months|forever --request-id UUID [--percent-off 70|100] [--months N] [--code CODE] [--expires-at UNIX_SECONDS] --execute

Requires STRIPE_API_KEY. Promo also requires
STRIPE_CANDIDATE_PRICE_ID and STRIPE_CANDIDATE_YEARLY_PRICE_ID.
Customer-restricted promotions are redeemable once. --shared explicitly creates
a reusable code for any customer; distribute it privately and deactivate it if leaked.
Discount defaults to 100%; 70% is available for the first month only.
Finite discounts apply only to the monthly product. Expiry limits redemption, not discount duration.
Reuse the same request ID and arguments when retrying a promotion operation.
--help performs no requests and needs no credentials.`;

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function productOf(price: Stripe.Price): Stripe.Product {
  const product = price.product;
  if (typeof product === "string" || "deleted" in product)
    throw new Error("Candidate price requires an expanded active product");
  if (!product.active || product.metadata.purpose !== PURPOSE)
    throw new Error("Candidate product is inactive or has a different purpose");
  return product;
}

function validatePrice(
  price: Stripe.Price,
  interval: Interval,
): Stripe.Product {
  const offer = OFFERS[interval];
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== offer.amount ||
    price.billing_scheme !== "per_unit" ||
    price.type !== "recurring" ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error(
      `Candidate ${interval} price must be active USD ${offer.amount} cents per ${interval}`,
    );
  }
  return productOf(price);
}

type PromoOptions = {
  shared?: boolean;
  customer?: string;
  duration?: string;
  months?: string;
  code?: string;
  "request-id"?: string;
  "expires-at"?: string;
  "percent-off"?: string;
};

async function ensureOfferPrice(
  stripe: Stripe,
  interval: Interval,
): Promise<Stripe.Price> {
  const offer = OFFERS[interval];
  const found = await stripe.prices.list({
    lookup_keys: [offer.lookup],
    limit: 2,
    expand: ["data.product"],
  });
  if (found.data.length > 1)
    throw new Error(`Ambiguous candidate ${interval} lookup key`);
  let price = found.data[0];
  if (!price) {
    let product: Stripe.Product | Stripe.DeletedProduct;
    try {
      product = await stripe.products.retrieve(offer.product);
    } catch (error) {
      if (
        !(error instanceof Stripe.errors.StripeInvalidRequestError) ||
        error.code !== "resource_missing"
      )
        throw error;
      product = await stripe.products.create(
        {
          id: offer.product,
          name: `Recruiters.rip candidate ${interval === "month" ? "monthly" : "yearly"}`,
          metadata: { purpose: PURPOSE },
        },
        { idempotencyKey: `${offer.lookup}:product` },
      );
    }
    if (
      "deleted" in product ||
      !product.active ||
      product.metadata.purpose !== PURPOSE
    )
      throw new Error(
        "Candidate product conflicts with existing configuration",
      );
    price = await stripe.prices.create(
      {
        product: product.id,
        currency: "usd",
        unit_amount: offer.amount,
        recurring: { interval },
        lookup_key: offer.lookup,
        metadata: { purpose: PURPOSE },
        expand: ["product"],
      },
      { idempotencyKey: `${offer.lookup}:price` },
    );
  }
  const product = validatePrice(price, interval);
  if (product.id !== offer.product)
    throw new Error(
      `Candidate ${interval} lookup key belongs to an unexpected product`,
    );
  return price;
}

function validatePromoAudience(values: PromoOptions): {
  duration: string;
  percentOff: string;
} {
  if (
    values.shared
      ? values.customer !== undefined
      : !/^cus_[A-Za-z0-9]+$/.test(values.customer ?? "")
  ) {
    throw new Error(
      "Choose either --shared or a valid --customer Stripe customer ID",
    );
  }
  const duration = values.duration;
  if (!["month", "months", "forever"].includes(duration ?? ""))
    throw new Error("--duration must be month, months or forever");
  const percentOff = values["percent-off"] ?? "100";
  if (
    !["70", "100"].includes(percentOff) ||
    (percentOff === "70" && duration !== "month")
  ) {
    throw new Error("Choose 100% off, or 70% off the first month");
  }
  return { duration, percentOff };
}

function validatePromoTiming(
  values: PromoOptions,
  duration: string,
  now: number,
): { months: number; expiresAt: number | undefined } {
  const months = Number(values.months);
  if (
    duration === "months"
      ? !/^\d+$/.test(values.months ?? "") ||
        !Number.isSafeInteger(months) ||
        months < 1
      : values.months !== undefined
  )
    throw new Error(
      "--months must be a positive integer and is allowed only with --duration months",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      values["request-id"] ?? "",
    )
  )
    throw new Error("--request-id must be a UUID");
  if (values.code !== undefined && !/^[A-Za-z0-9]{1,100}$/.test(values.code))
    throw new Error("--code must contain 1–100 letters or digits");
  const expiresAt =
    values["expires-at"] === undefined
      ? undefined
      : Number(values["expires-at"]);
  if (
    expiresAt !== undefined &&
    (!/^\d+$/.test(values["expires-at"]) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now)
  )
    throw new Error("--expires-at must be future Unix seconds");
  return { months, expiresAt };
}

async function createPromotion(
  stripe: Stripe,
  values: PromoOptions,
  offer: {
    duration: string;
    percentOff: string;
    months: number;
    expiresAt: number | undefined;
    monthly: Stripe.Product;
    yearly: Stripe.Product;
  },
): Promise<string> {
  const { duration, percentOff, months, expiresAt, monthly, yearly } = offer;
  const requestId = values["request-id"];
  let couponDuration: Stripe.CouponCreateParams["duration"] = "repeating";
  if (duration === "forever") couponDuration = "forever";
  else if (duration === "month") couponDuration = "once";
  const coupon = await stripe.coupons.create(
    {
      id: `rr_candidate_${requestId}`,
      percent_off: Number(percentOff),
      duration: couponDuration,
      ...(duration === "months" ? { duration_in_months: months } : {}),
      applies_to: {
        products:
          duration === "forever" ? [monthly.id, yearly.id] : [monthly.id],
      },
      ...(values.shared ? {} : { max_redemptions: 1 }),
      ...(expiresAt === undefined ? {} : { redeem_by: expiresAt }),
    },
    { idempotencyKey: `candidate-offer:${requestId}:coupon` },
  );
  const promotion = await stripe.promotionCodes.create(
    {
      promotion: { type: "coupon", coupon: coupon.id },
      ...(values.shared
        ? {}
        : { customer: values.customer, max_redemptions: 1 }),
      ...(values.code === undefined ? {} : { code: values.code }),
      ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
    },
    { idempotencyKey: `candidate-offer:${requestId}:promotion` },
  );
  return JSON.stringify(
    {
      couponId: coupon.id,
      promotionCodeId: promotion.id,
      code: promotion.code,
    },
    null,
    2,
  );
}

async function setup(stripe: Stripe): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const interval of ["month", "year"] as const) {
    const price = await ensureOfferPrice(stripe, interval);
    result[
      interval === "month"
        ? "STRIPE_CANDIDATE_PRICE_ID"
        : "STRIPE_CANDIDATE_YEARLY_PRICE_ID"
    ] = price.id;
  }
  return result;
}

async function validateCandidateCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<void> {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer) throw new Error("Customer has been deleted");
  if (
    customer.metadata?.purpose !== PURPOSE ||
    !/^[1-9]\d*$/.test(customer.metadata.candidateId ?? "")
  ) {
    throw new Error(
      "Customer must belong to a candidate account with matching purpose and candidateId metadata",
    );
  }
}

export async function runCandidateOffers(
  args: string[],
  env: Environment,
  stripeFactory: (key: string) => Stripe = key => new Stripe(key),
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      execute: { type: "boolean" },
      customer: { type: "string" },
      duration: { type: "string" },
      months: { type: "string" },
      code: { type: "string" },
      "request-id": { type: "string" },
      "expires-at": { type: "string" },
      shared: { type: "boolean" },
      "percent-off": { type: "string" },
    },
  });
  if (values.help) return HELP;
  if (positionals.length !== 1 || !["setup", "promo"].includes(positionals[0]))
    throw new Error("Choose setup or promo; use --help for syntax");
  if (!values.execute) throw new Error("Writes require explicit --execute");
  if (positionals[0] === "setup") {
    if (Object.keys(values).some(key => key !== "execute"))
      throw new Error("Setup accepts only --execute");
    const stripe = stripeFactory(
      requireValue(env.STRIPE_API_KEY, "STRIPE_API_KEY"),
    );
    return JSON.stringify(await setup(stripe), null, 2);
  }
  const { duration, percentOff } = validatePromoAudience(values);
  const { months, expiresAt } = validatePromoTiming(values, duration, now);
  const monthlyId = requireValue(
    env.STRIPE_CANDIDATE_PRICE_ID,
    "STRIPE_CANDIDATE_PRICE_ID",
  );
  const yearlyId = requireValue(
    env.STRIPE_CANDIDATE_YEARLY_PRICE_ID,
    "STRIPE_CANDIDATE_YEARLY_PRICE_ID",
  );
  if (
    !/^price_[A-Za-z0-9]+$/.test(monthlyId) ||
    !/^price_[A-Za-z0-9]+$/.test(yearlyId) ||
    monthlyId === yearlyId
  )
    throw new Error("Candidate price IDs must be distinct Stripe price IDs");
  const stripe = stripeFactory(
    requireValue(env.STRIPE_API_KEY, "STRIPE_API_KEY"),
  );
  const monthly = validatePrice(
    await stripe.prices.retrieve(monthlyId, { expand: ["product"] }),
    "month",
  );
  const yearly = validatePrice(
    await stripe.prices.retrieve(yearlyId, { expand: ["product"] }),
    "year",
  );
  if (monthly.id === yearly.id)
    throw new Error(
      "Candidate monthly and yearly prices must use separate products",
    );
  if (!values.shared) {
    await validateCandidateCustomer(stripe, values.customer);
  }
  return createPromotion(stripe, values, {
    duration,
    percentOff,
    months,
    expiresAt,
    monthly,
    yearly,
  });
}

if (require.main === module) {
  runCandidateOffers(process.argv.slice(2), process.env)
    .then(result => console.log(result))
    .catch(error => {
      // Stripe errors can contain request bodies and customer details: never dump them.
      let message = "Candidate offer operation failed";
      if (error instanceof Stripe.errors.StripeError) {
        message = `Stripe operation failed (${error.type}); inspect the Stripe dashboard before retrying with the same request ID.`;
      } else if (error instanceof Error) {
        message = error.message;
      }
      console.error(message);
      process.exitCode = 1;
    });
}
