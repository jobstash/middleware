import {
  aggregateKnownBountyTotals,
  groupKnownBountyTotalsByCompany,
  parseKnownBountyAmount,
} from "./bounty-amounts";

describe("placement bounty amount totals", () => {
  it.each([
    ["$10,000 for successful referrals", { currency: "USD", amount: 10000 }],
    ["10K in USDC", { currency: "USDC", amount: 10000 }],
    ["3000 USDC or USD", { currency: "USD_OR_USDC", amount: 3000 }],
    [
      "£1,000 (or equivalent in local currency)",
      { currency: "GBP", amount: 1000 },
    ],
    ["지원자, 추천인 각 현금 50만원", { currency: "KRW", amount: 500000 }],
  ])("parses %s without converting currencies", (value, expected) => {
    expect(parseKnownBountyAmount(value)).toEqual(expected);
  });

  it.each(["10% of salary", "up to $10,000", "$5,000 to $10,000", null])(
    "excludes non-fixed amount %s from known totals",
    value => {
      expect(parseKnownBountyAmount(value)).toBeNull();
    },
  );
  it.each([
    ["1.5 만 원", { currency: "KRW", amount: 15000 }],
    ["1,5만원", { currency: "KRW", amount: 15000 }],
    ["123,456,78만원", { currency: "KRW", amount: 4567800 }],
    ["$2.5M", { currency: "USD", amount: 2500000 }],
    ["USD 1,0000", null],
    ["USD 1.2.3", { currency: "USD", amount: 1.2 }],
    ["9".repeat(100_000) + " 만 x", null],
    ["1" + " ".repeat(100_000) + "만 원", { currency: "KRW", amount: 10000 }],
    ["9".repeat(100_000) + " USD", null],
    ["USD 1" + ",000".repeat(20_000) + "0", null],
  ])(
    "preserves numeric grammar, including long near misses",
    (value, expected) => {
      expect(parseKnownBountyAmount(value)).toEqual(expected);
    },
  );

  it("totals each currency globally and per company", () => {
    const rows = [
      { companyId: "moonpay", bountyAmount: "10K USDC" },
      { companyId: "moonpay", bountyAmount: "10K in USDC" },
      { companyId: "legend", bountyAmount: "$10,000" },
      { companyId: "unknown", bountyAmount: "Amount varies" },
    ];
    expect(aggregateKnownBountyTotals(rows)).toEqual([
      { currency: "USD", amount: 10000, jobCount: 1 },
      { currency: "USDC", amount: 20000, jobCount: 2 },
    ]);
    expect(groupKnownBountyTotalsByCompany(rows).get("moonpay")).toEqual([
      { currency: "USDC", amount: 20000, jobCount: 2 },
    ]);
  });
});
