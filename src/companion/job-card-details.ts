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
