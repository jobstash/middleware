type RecordValue = Record<string, any>;

interface JobCardEntity {
  name: string; logoUrl: string | null; website: string | null;
  category: string | null; location: string | null; summary: string | null; description: string | null;
  headcountEstimate: number | null; fundingStage: string | null;
  investors: string[];
  fundingRounds: { name: string | null; amount: number | null; currency: string | null; date: string | null }[];
}

const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown, limit = 300): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, " ").replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, limit) : null;
};
const amount = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const names = (value: unknown, limit: number): string[] => {
  const result = new Set<string>();
  for (const item of list(value)) {
    const name = text(typeof item === "string" ? item : record(item).name);
    if (name) result.add(name);
    if (result.size >= limit) break;
  }
  return [...result];
};
const safeUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
};
const date = (value: unknown): string | null => {
  let timestamp: number;
  if (value instanceof Date) timestamp = value.getTime();
  else if (typeof value === "number") timestamp = value < 100_000_000_000 ? value * 1000 : value;
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) timestamp = Date.parse(value);
  else return null;
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > 253_402_300_799_999) return null;
  return new Date(timestamp).toISOString();
};
const label = (value: unknown): string | null => {
  const source = text(value);
  if (!source || /^(unknown|unspecified|unstated|n\/a|null)$/i.test(source)) return null;
  const spaced = source.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};
const periodLabels: Record<string, string> = { HOURLY: "hour", DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };

export function projectJobSalary(payload: RecordValue) {
  const payRate = typeof payload.payRate === "string" ? periodLabels[payload.payRate.toUpperCase()] ?? null : null;
  const rawMinimum = amount(payload.extractedMinimumSalary);
  const rawMaximum = amount(payload.extractedMaximumSalary);
  const useRaw = rawMinimum !== null || rawMaximum !== null;
  let minimum = useRaw ? rawMinimum : amount(payload.minimumSalary);
  let maximum = useRaw ? rawMaximum : amount(payload.maximumSalary);
  if (minimum !== null && maximum !== null && minimum > maximum) [minimum, maximum] = [maximum, minimum];
  const stated = useRaw ? null : amount(payload.salary);
  if (minimum === null && maximum === null && stated === null) return null;
  return {
    minimum, maximum, stated, currency: text(payload.salaryCurrency, 30),
    // Stored minimum/maximum/salary are annualized by ETL. A missing rate is
    // not evidence of a period, even though ETL historically defaulted it.
    period: useRaw ? payRate : payRate ? "year" : null,
  };
}

function entity(value: unknown): JobCardEntity | null {
  const source = record(value);
  const name = text(source.name);
  if (!name) return null;
  const summary = text(source.summary, 20_000);
  const description = text(source.description, 20_000);
  return {
    name, logoUrl: safeUrl(source.logoUrl) ?? safeUrl(source.logo), website: safeUrl(source.website),
    category: text(source.category), location: text(source.location, 1000),
    summary, description: description === summary ? null : description,
    headcountEstimate: amount(source.headcountEstimate), fundingStage: label(source.fundingStage),
    investors: names(source.investors, 40),
    fundingRounds: list(source.fundingRounds).slice(0, 20).map(value => {
      const round = record(value);
      return { name: text(round.roundName), amount: amount(round.raisedAmount), currency: text(round.currency, 30), date: date(round.date) };
    }).filter(round => round.name || round.amount !== null || round.date),
  };
}

function utcOffset(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > 14 * 60) return null;
  const absolute = Math.abs(value);
  return `UTC${value < 0 ? "−" : "+"}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`;
}

/** Read-only projection of already-joined metadata; never loads or infers facts. */
export function projectJobCardDetails(row: {
  payload: Record<string, any>;
  organizationPayload?: unknown;
  projectPayload?: unknown;
  publishedTimestamp?: unknown;
}) {
  const payload = record(row.payload);
  const organizationSource = record(row.organizationPayload ?? payload.organization);
  const projectSource = record(row.projectPayload ?? payload.project);
  const organization = entity(organizationSource);
  const project = entity(projectSource);
  const published = payload.publishedTimestampIsVerified === true ? date(payload.publishedTimestamp) ?? date(row.publishedTimestamp) : null;
  const firstSeen = date(payload.firstSeenTimestamp);
  const seniorityValue = text(payload.seniority);
  const seniorities: Record<string, string> = { "1": "Intern", "2": "Junior", "3": "Senior", "4": "Lead", "5": "Head" };
  const availability: { requirement: "required" | "preferred"; label: string }[] = [];
  const availabilityKeys = new Set<string>();
  for (const item of list(payload.availability)) {
    const value = record(item);
    if (value.requirement !== "required" && value.requirement !== "preferred") continue;
    const minimum = utcOffset(value.minimumUtcOffsetMinutes);
    const maximum = utcOffset(value.maximumUtcOffsetMinutes);
    const timezone = text(value.timezone) ?? (minimum && maximum && minimum !== maximum ? `${minimum}–${maximum}` : minimum ?? maximum);
    const description = [label(value.workMode), text(value.placeName) ?? text(value.placeText), timezone].filter(Boolean).join(" · ") || text(value.rawText, 1000);
    if (!description) continue;
    const key = `${value.requirement}:${description}`;
    if (availabilityKeys.has(key)) continue;
    availabilityKeys.add(key);
    availability.push({ requirement: value.requirement, label: description.slice(0, 1000) });
    if (availability.length >= 30) break;
  }
  const relatedProjects: JobCardEntity[] = [];
  const projectKeys = new Set<string>();
  for (const item of list(organizationSource.projects)) {
    const value = record(item);
    const related = entity(value);
    if (!related || value.id && value.id === projectSource.id || project && related.name === project.name) continue;
    const key = String(value.id ?? related.name);
    if (projectKeys.has(key)) continue;
    projectKeys.add(key);
    relatedProjects.push(related);
    if (relatedProjects.length >= 20) break;
  }
  return {
    date: published ? { value: published, provenance: "posted" as const } : firstSeen ? { value: firstSeen, provenance: "first_seen" as const } : null,
    seniority: seniorityValue ? typeof seniorities[seniorityValue] === "string" ? seniorities[seniorityValue] : /^\d+$/.test(seniorityValue) ? null : label(seniorityValue) : null,
    salary: projectJobSalary(payload), location: text(payload.location, 1000),
    workMode: label(payload.locationType) ?? label(record(payload.workArrangement).classification),
    commitment: label(payload.commitment), classification: label(payload.classification),
    paysInCrypto: payload.paysInCrypto === true, offersTokenAllocation: payload.offersTokenAllocation === true,
    skills: names(payload.tags, 100), availability, organization, project, relatedProjects,
  };
}
