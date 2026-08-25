export interface KnownBountyTotal {
  currency: string;
  amount: number;
  jobCount: number;
}

interface BountyAmountRow {
  companyId: string;
  bountyAmount: string | null;
}

const CURRENCY_CODES = [
  "USDC",
  "USDT",
  "USD",
  "EUR",
  "GBP",
  "KRW",
  "CAD",
  "AUD",
  "SGD",
  "HKD",
  "JPY",
  "CNY",
  "INR",
  "BTC",
  "ETH",
] as const;

const CURRENCY_ORDER = [
  "USD",
  "USDC",
  "USD_OR_USDC",
  "USDT",
  "EUR",
  "GBP",
  "KRW",
];

const rounded = (value: number): number => Number(value.toFixed(8));

const currencyFrom = (value: string): string | null => {
  const upper = value.toUpperCase();
  const codes = CURRENCY_CODES.filter(code =>
    new RegExp(`\\b${code}\\b`).test(upper),
  );
  if (codes.includes("USD") && codes.includes("USDC")) return "USD_OR_USDC";
  if (codes.length === 1) return codes[0];
  if (codes.length > 1) return null;
  if (value.includes("$")) return "USD";
  if (value.includes("€")) return "EUR";
  if (value.includes("£")) return "GBP";
  if (value.includes("₩") || value.includes("원")) return "KRW";
  if (value.includes("₹")) return "INR";
  return null;
};

export const parseKnownBountyAmount = (
  value: string | null,
): Omit<KnownBountyTotal, "jobCount"> | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.includes("%") ||
    /\b(?:up to|maximum|max(?:imum)?|starting at|from|between)\b/i.test(
      normalized,
    )
  ) {
    return null;
  }

  const korean = normalized.match(/(\d+(?:[.,]\d+)?)\s*만\s*원/);
  if (korean) {
    const amount = Number(korean[1].replace(",", ".")) * 10_000;
    return Number.isFinite(amount) ? { currency: "KRW", amount } : null;
  }

  const matches = [
    ...normalized.matchAll(
      /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kKmM])?(?![\d])/g,
    ),
  ];
  if (matches.length !== 1) return null;
  const currency = currencyFrom(normalized);
  if (!currency) return null;
  const base = Number(matches[0][1].replaceAll(",", ""));
  const suffix = matches[0][2]?.toUpperCase();
  const multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : 1;
  const amount = rounded(base * multiplier);
  return Number.isFinite(amount) && amount > 0 ? { currency, amount } : null;
};

export const aggregateKnownBountyTotals = (
  rows: BountyAmountRow[],
): KnownBountyTotal[] => {
  const totals = new Map<string, KnownBountyTotal>();
  for (const row of rows) {
    const parsed = parseKnownBountyAmount(row.bountyAmount);
    if (!parsed) continue;
    const current = totals.get(parsed.currency);
    totals.set(parsed.currency, {
      currency: parsed.currency,
      amount: rounded((current?.amount ?? 0) + parsed.amount),
      jobCount: (current?.jobCount ?? 0) + 1,
    });
  }
  return [...totals.values()].sort((left, right) => {
    const leftIndex = CURRENCY_ORDER.indexOf(left.currency);
    const rightIndex = CURRENCY_ORDER.indexOf(right.currency);
    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex) ||
      left.currency.localeCompare(right.currency)
    );
  });
};

export const groupKnownBountyTotalsByCompany = (
  rows: BountyAmountRow[],
): Map<string, KnownBountyTotal[]> => {
  const companies = new Map<string, BountyAmountRow[]>();
  for (const row of rows) {
    companies.set(row.companyId, [
      ...(companies.get(row.companyId) ?? []),
      row,
    ]);
  }
  return new Map(
    [...companies].map(([companyId, amounts]) => [
      companyId,
      aggregateKnownBountyTotals(amounts),
    ]),
  );
};
