import Stripe from "stripe";
import { HELP, runCandidateOffers } from "./candidate-stripe-offers";

const PURPOSE = "recruiters-rip-candidate-v1";
const requestId = "c0ffee00-0000-4000-8000-000000000001";
const env = {
  STRIPE_API_KEY: "sk_test_synthetic",
  STRIPE_CANDIDATE_PRICE_ID: "price_month",
  STRIPE_CANDIDATE_YEARLY_PRICE_ID: "price_year",
};
const product = (interval: "month" | "year") => ({
  id: `recruiters_rip_candidate_${interval}_v1`, object: "product", active: true, metadata: { purpose: PURPOSE },
});
const price = (interval: "month" | "year") => ({
  id: `price_${interval}`, object: "price", active: true, currency: "usd", unit_amount: interval === "month" ? 999 : 9590,
  type: "recurring", billing_scheme: "per_unit", recurring: { interval, interval_count: 1, usage_type: "licensed" }, product: product(interval),
});
type Request = { path: string; method: string; params: URLSearchParams; idempotencyKey: string | null };
function transport(respond: (request: Request) => unknown = () => undefined) {
  const requests: Request[] = [];
  const stripe = new Stripe("sk_test_synthetic", {
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async (input, init) => {
      const url = new URL(String(input));
      const request = {
        path: url.pathname, method: init?.method ?? "GET",
        params: new URLSearchParams(init?.body ? String(init.body) : url.search),
        idempotencyKey: new Headers(init?.headers).get("Idempotency-Key"),
      };
      requests.push(request);
      let body = respond(request);
      if (body === undefined) {
        if (request.path === "/v1/prices/price_month") body = price("month");
        else if (request.path === "/v1/prices/price_year") body = price("year");
        else if (request.path.startsWith("/v1/customers/")) body = { id: "cus_selected", object: "customer", metadata: { purpose: PURPOSE, candidateId: "42" } };
        else if (request.path === "/v1/coupons") body = { id: request.params.get("id"), object: "coupon" };
        else if (request.path === "/v1/promotion_codes") body = { id: "promo_created", object: "promotion_code", code: request.params.get("code") ?? "GENERATED" };
        else throw new Error(`Unexpected synthetic Stripe request ${request.method} ${request.path}`);
      }
      const failure = body as { error?: unknown };
      return new Response(JSON.stringify(body), { status: failure.error ? 400 : 200, headers: { "content-type": "application/json" } });
    }),
  });
  return { stripe, requests, factory: () => stripe };
}
const promoArgs = (duration = "month") => ["promo", "--execute", "--customer", "cus_selected", "--duration", duration, "--request-id", requestId];

describe("candidate Stripe operator CLI (synthetic transport)", () => {
  it("shows credential-free help without constructing a Stripe client", async () => {
    const factory = jest.fn();
    await expect(runCandidateOffers(["--help"], {}, factory)).resolves.toBe(HELP);
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    ["month", [], "once", undefined],
    ["months", ["--months", "3"], "repeating", "3"],
    ["forever", [], "forever", undefined],
  ])("creates a restricted %s discount with native Stripe semantics", async (duration, extra, stripeDuration, months) => {
    const fake = transport();
    const output = JSON.parse(await runCandidateOffers([...promoArgs(duration), ...extra, "--code", "SELECTED100", "--expires-at", "2000000000"], env, fake.factory, 1900000000));
    const coupon = fake.requests.find(r => r.path === "/v1/coupons")!;
    expect(coupon.method).toBe("POST");
    expect(coupon.params.get("percent_off")).toBe("100");
    expect(coupon.params.get("duration")).toBe(stripeDuration);
    expect(coupon.params.get("duration_in_months")).toBe(months ?? null);
    expect(coupon.params.get("max_redemptions")).toBe("1");
    expect(coupon.params.get("redeem_by")).toBe("2000000000");
    expect(coupon.params.get("applies_to[products][0]")).toBe(product("month").id);
    expect(coupon.params.get("applies_to[products][1]")).toBe(duration === "forever" ? product("year").id : null);
    expect(coupon.idempotencyKey).toBe(`candidate-offer:${requestId}:coupon`);
    const promotion = fake.requests.find(r => r.path === "/v1/promotion_codes")!;
    expect(promotion.params.get("customer")).toBe("cus_selected");
    expect(promotion.params.get("coupon")).toBe(`rr_candidate_${requestId}`);
    expect(promotion.params.get("max_redemptions")).toBe("1");
    expect(promotion.params.get("expires_at")).toBe("2000000000");
    expect(promotion.params.get("code")).toBe("SELECTED100");
    expect(promotion.idempotencyKey).toBe(`candidate-offer:${requestId}:promotion`);
    expect(output).toEqual({ couponId: `rr_candidate_${requestId}`, promotionCodeId: "promo_created", code: "SELECTED100" });
    expect(JSON.stringify(output)).not.toContain(env.STRIPE_API_KEY);
  });

  it("lets Stripe generate the code without relaxing customer or redemption restrictions", async () => {
    const fake = transport();
    await runCandidateOffers(promoArgs(), env, fake.factory);
    const promotion = fake.requests.find(r => r.path === "/v1/promotion_codes")!;
    expect(promotion.params.has("code")).toBe(false);
    expect(promotion.params.get("customer")).toBe("cus_selected");
    expect(promotion.params.get("max_redemptions")).toBe("1");
  });

  it.each([
    ["forever", "100", "forever", true],
    ["month", "70", "once", false],
  ])("creates a shared %s %s%% code without customer or total redemption restrictions", async (duration, percent, stripeDuration, includesYear) => {
    const fake = transport();
    await runCandidateOffers(["promo", "--execute", "--shared", "--duration", duration, "--percent-off", percent, "--request-id", requestId], env, fake.factory);
    const coupon = fake.requests.find(r => r.path === "/v1/coupons")!;
    const promotion = fake.requests.find(r => r.path === "/v1/promotion_codes")!;
    expect(coupon.params.get("percent_off")).toBe(percent);
    expect(coupon.params.get("duration")).toBe(stripeDuration);
    expect(coupon.params.get("applies_to[products][0]")).toBe(product("month").id);
    expect(coupon.params.get("applies_to[products][1]")).toBe(includesYear ? product("year").id : null);
    expect(coupon.params.has("max_redemptions")).toBe(false);
    expect(promotion.params.has("max_redemptions")).toBe(false);
    expect(promotion.params.has("customer")).toBe(false);
    expect(fake.requests.some(r => r.path.startsWith("/v1/customers"))).toBe(false);
  });

  it.each([
    ["--shared"],
    ["--percent-off", "101"],
    ["--percent-off", "0"],
  ])("rejects ambiguous audiences or unsupported discount percentages: %j", async (...extra) => {
    const fake = transport();
    await expect(runCandidateOffers([...promoArgs(), ...extra], env, fake.factory)).rejects.toThrow();
    expect(fake.requests).toHaveLength(0);
  });

  it("does not let first-month discounts become first-year discounts", async () => {
    const fake = transport();
    await expect(runCandidateOffers(["promo", "--execute", "--shared", "--duration", "forever", "--percent-off", "70", "--request-id", requestId], env, fake.factory)).rejects.toThrow();
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ["--customer", ""], ["--duration", "all"], ["--request-id", "invalid"],
    ["--months", "0"], ["--code", "not-valid!"], ["--expires-at", "1"],
  ])("rejects invalid %s before making requests", async (flag, value) => {
    const args = promoArgs();
    const index = args.indexOf(flag);
    if (index >= 0) args[index + 1] = value;
    else args.push(flag, value);
    const fake = transport();
    await expect(runCandidateOffers(args, env, fake.factory)).rejects.toThrow();
    expect(fake.requests).toHaveLength(0);
  });

  it("requires execution consent and refuses unknown options", async () => {
    const fake = transport();
    await expect(runCandidateOffers(["setup"], env, fake.factory)).rejects.toThrow("--execute");
    await expect(runCandidateOffers([...promoArgs(), "--public"], env, fake.factory)).rejects.toThrow();
    expect(fake.requests).toHaveLength(0);
  });

  it.each(["same-product", "wrong-amount", "inactive-product", "wrong-purpose", "deleted-customer"])("refuses %s before creating any discounts", async mode => {
    const fake = transport(request => {
      if (request.path === "/v1/prices/price_year") {
        const p = price("year");
        if (mode === "same-product") p.product.id = product("month").id;
        if (mode === "wrong-amount") p.unit_amount = 999;
        if (mode === "inactive-product") p.product.active = false;
        if (mode === "wrong-purpose") p.product.metadata.purpose = "unrelated";
        return p;
      }
      if (mode === "deleted-customer" && request.path.startsWith("/v1/customers/")) return { id: "cus_selected", deleted: true };
    });
    await expect(runCandidateOffers(promoArgs(), env, fake.factory)).rejects.toThrow();
    expect(fake.requests.every(r => r.method === "GET")).toBe(true);
  });

  it.each([
    {},
    { purpose: "recruiter-agency", candidateId: "42" },
    { purpose: PURPOSE },
    { purpose: PURPOSE, candidateId: "not-an-owner" },
    { purpose: PURPOSE, candidateId: "0" },
  ])("rejects foreign or unbound Stripe customer metadata %j", async metadata => {
    const fake = transport(r => r.path.startsWith("/v1/customers/")
      ? { id: "cus_selected", object: "customer", metadata }
      : undefined);
    await expect(runCandidateOffers(promoArgs(), env, fake.factory)).rejects.toThrow("Customer must belong to a candidate account");
    expect(fake.requests.every(r => r.method === "GET")).toBe(true);
  });

  it("propagates Stripe rejection without attempting promotion creation", async () => {
    const fake = transport(r => r.path === "/v1/coupons" ? { error: { type: "invalid_request_error", message: "Synthetic coupon rejection" } } : undefined);
    await expect(runCandidateOffers(promoArgs(), env, fake.factory)).rejects.toThrow("Synthetic coupon rejection");
    expect(fake.requests.some(r => r.path === "/v1/promotion_codes")).toBe(false);
  });

  it("reuses stable lookup prices on repeated setup without mutations", async () => {
    const fake = transport(r => {
      if (r.path === "/v1/prices") return { object: "list", data: [price(r.params.get("lookup_keys[0]")!.includes("month") ? "month" : "year")], has_more: false };
    });
    for (let i = 0; i < 2; i++) {
      const result = JSON.parse(await runCandidateOffers(["setup", "--execute"], env, fake.factory));
      expect(result.STRIPE_CANDIDATE_PRICE_ID).toBe("price_month");
      expect(result.STRIPE_CANDIDATE_YEARLY_PRICE_ID).toBe("price_year");
    }
    expect(fake.requests).toHaveLength(4);
    expect(fake.requests.every(r => r.method === "GET")).toBe(true);
  });

  it("provisions separate products and exact USD recurring prices with stable keys", async () => {
    const fake = transport(r => {
      if (r.path === "/v1/prices" && r.method === "GET") return { object: "list", data: [], has_more: false };
      if (r.path.startsWith("/v1/products/")) return { error: { type: "invalid_request_error", code: "resource_missing", message: "Missing synthetic product" } };
      if (r.path === "/v1/products") return product(r.params.get("id")!.includes("month") ? "month" : "year");
      if (r.path === "/v1/prices" && r.method === "POST") return price(r.params.get("recurring[interval]") as "month" | "year");
    });
    await runCandidateOffers(["setup", "--execute"], env, fake.factory);
    const writes = fake.requests.filter(r => r.method === "POST");
    expect(writes).toHaveLength(4);
    const prices = writes.filter(r => r.path === "/v1/prices");
    expect(prices.map(r => r.params.get("unit_amount"))).toEqual(["999", "9590"]);
    expect(prices.map(r => r.params.get("currency"))).toEqual(["usd", "usd"]);
    expect(prices.map(r => r.params.get("recurring[interval]"))).toEqual(["month", "year"]);
    expect(prices.map(r => r.params.get("product"))).toEqual([product("month").id, product("year").id]);
    expect(prices.every(r => r.params.get("lookup_key") && r.idempotencyKey)).toBe(true);
    expect(writes.every(r => !Array.from(r.params.keys()).some(k => k.startsWith("metadata[") && k !== "metadata[purpose]"))).toBe(true);
  });

  it("fails closed on a conflicting existing lookup price without modifying it", async () => {
    const fake = transport(r => r.path === "/v1/prices" ? { object: "list", data: [{ ...price("month"), unit_amount: 100 }], has_more: false } : undefined);
    await expect(runCandidateOffers(["setup", "--execute"], env, fake.factory)).rejects.toThrow("999 cents");
    expect(fake.requests).toHaveLength(1);
  });
});
