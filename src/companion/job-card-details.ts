import { getGoogleLogoUrl } from "src/shared/helpers";

type RecordValue = Record<string, unknown>;
export interface JobSalary {
  minimum: number | null;
  maximum: number | null;
  stated: number | null;
  currency: string | null;
  period: string | null;
}
const text = (value: unknown, limit = 300): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return cleaned ? cleaned.slice(0, limit) : null;
};
const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
const periodLabels: Record<string, string> = {
  HOURLY: "hour",
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};
// Employer-supplied links reach companions only as credential-free https URLs.
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
// Same fallback as the public jobs API: a stored logo, else the website's favicon.
export function employerLogoUrl(
  logoUrl: unknown,
  website: unknown,
): string | null {
  const stored = safeUrl(logoUrl);
  if (stored || typeof website !== "string" || !website.trim()) return stored;
  try {
    const favicon = getGoogleLogoUrl(website);
    return favicon.includes("domain=&") ? null : safeUrl(favicon);
  } catch {
    return null;
  }
}

export function projectJobSalary(payload: RecordValue): JobSalary | null {
  const payRate =
    typeof payload.payRate === "string"
      ? (periodLabels[payload.payRate.toUpperCase()] ?? null)
      : null;
  const rawMinimum = amount(payload.extractedMinimumSalary);
  const rawMaximum = amount(payload.extractedMaximumSalary);
  const useRaw = rawMinimum !== null || rawMaximum !== null;
  let minimum = useRaw ? rawMinimum : amount(payload.minimumSalary);
  let maximum = useRaw ? rawMaximum : amount(payload.maximumSalary);
  if (minimum !== null && maximum !== null && minimum > maximum)
    [minimum, maximum] = [maximum, minimum];
  const stated = useRaw ? null : amount(payload.salary);
  if (minimum === null && maximum === null && stated === null) return null;
  return {
    minimum,
    maximum,
    stated,
    currency: text(payload.salaryCurrency, 30),
    // Stored minimum/maximum/salary are annualized by ETL. A missing rate is
    // not evidence of a period, even though ETL historically defaulted it.
    period: useRaw ? payRate : payRate ? "year" : null,
  };
}
