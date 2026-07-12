import { createHash } from "node:crypto";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const unorderedRelationKeys = new Set([
  "aliases",
  "audits",
  "chains",
  "detectedJobsites",
  "ecosystems",
  "fundingRounds",
  "grants",
  "hacks",
  "investors",
  "jobs",
  "jobsites",
  "orgIds",
  "orgNames",
  "projects",
  "repos",
  "tags",
]);

export const semanticHash = (value: JsonValue): string =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");

export const canonicalize = (
  value: JsonValue,
  relationKey?: string,
): JsonValue => {
  if (Array.isArray(value)) {
    const items = value.map(item => canonicalize(item));
    return relationKey && unorderedRelationKeys.has(relationKey)
      ? [...items].sort((left, right) =>
          stableArrayKey(left).localeCompare(stableArrayKey(right)),
        )
      : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key], key)]),
    );
  }
  return value;
};

export const legacyJobPageEquivalent = (
  productionItems: JsonValue[],
  localItems: JsonValue[],
  orderBy = "publicationDate",
): boolean => {
  if (productionItems.length !== localItems.length) return false;
  for (const access of ["public", "protected"]) {
    const production = productionItems
      .filter(item => property(item, "access") === access)
      .map(item => jobSortSignature(item, orderBy));
    const local = localItems
      .filter(item => property(item, "access") === access)
      .map(item => jobSortSignature(item, orderBy));
    if (!legacyBoundarySequenceEquivalent(production, local)) return false;
  }
  return true;
};

const legacyBoundarySequenceEquivalent = (
  production: string[],
  local: string[],
): boolean => {
  if (sameStrings(production, local)) return true;

  // Protected jobs are interleaved with maxJitter: 2 after sorting. A page
  // boundary can therefore contain up to two extra items from either access
  // stream, but the retained stream must remain an exact prefix or suffix.
  const difference = Math.abs(production.length - local.length);
  if (difference === 0 || difference > 2) return false;

  const shorter = production.length < local.length ? production : local;
  const longer = production.length < local.length ? local : production;
  return (
    sameStrings(shorter, longer.slice(0, shorter.length)) ||
    sameStrings(shorter, longer.slice(difference))
  );
};

export const compatibleSampledContracts = (
  productionItems: JsonValue[],
  localItems: JsonValue[],
  typePathCollector: (value: JsonValue) => string[],
): boolean => {
  if (!sameStrings(topLevelKeys(productionItems), topLevelKeys(localItems))) {
    return false;
  }
  const production = typeMap(productionItems, typePathCollector);
  const local = typeMap(localItems, typePathCollector);
  for (const path of [...production.keys()].filter(path => local.has(path))) {
    const productionTypes = production.get(path) ?? new Set<string>();
    const localTypes = local.get(path) ?? new Set<string>();
    if (productionTypes.has("null") || localTypes.has("null")) continue;
    if (![...productionTypes].some(type => localTypes.has(type))) return false;
  }
  return true;
};

export const matchingItemsSemanticallyEqual = (
  productionItems: JsonValue[],
  localItems: JsonValue[],
  identityKey: string,
  ignoredKeys: readonly string[] = [],
): { equal: boolean; matched: number } => {
  const ignored = new Set(ignoredKeys);
  const local = new Map(
    localItems.map(item => [String(property(item, identityKey)), item]),
  );
  let matched = 0;
  for (const item of productionItems) {
    const identity = String(property(item, identityKey));
    const counterpart = local.get(identity);
    if (!counterpart) continue;
    matched++;
    const productionComparable = omitObjectKeys(item, ignored);
    const localComparable = omitObjectKeys(counterpart, ignored);
    if (semanticHash(productionComparable) !== semanticHash(localComparable)) {
      return { equal: false, matched };
    }
  }
  return { equal: true, matched };
};

const omitObjectKeys = (value: JsonValue, ignored: Set<string>): JsonValue => {
  if (!ignored.size) return value;
  if (Array.isArray(value)) {
    return value.map(item => omitObjectKeys(item, ignored));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ignored.has(key))
        .map(([key, item]) => [key, omitObjectKeys(item, ignored)]),
    );
  }
  return value;
};

export const boundedMutableCollectionDrift = ({
  productionTotal,
  localTotal,
  productionItems,
  localItems,
  requestedLimit,
  matchedIdentities,
  sortSignaturesMatch = false,
}: {
  productionTotal?: number;
  localTotal?: number;
  productionItems: number;
  localItems: number;
  requestedLimit: number;
  matchedIdentities: number;
  sortSignaturesMatch?: boolean;
}): boolean => {
  if (productionTotal === undefined || localTotal === undefined) return false;
  if (productionTotal === localTotal) return false;
  const maximumTotal = Math.max(productionTotal, localTotal);
  const totalDifference = Math.abs(productionTotal - localTotal);
  const allowedDifference = Math.max(5, Math.ceil(maximumTotal * 0.02));
  if (totalDifference > allowedDifference) return false;

  const completeCollections =
    productionItems === productionTotal && localItems === localTotal;
  if (completeCollections) {
    return matchedIdentities >= Math.min(productionItems, localItems);
  }

  if (productionItems !== requestedLimit || localItems !== requestedLimit) {
    return false;
  }
  if (sortSignaturesMatch) return true;

  const boundaryDrift =
    maximumTotal <= 100 ? Math.max(2, Math.min(3, totalDifference)) : 2;
  return matchedIdentities >= Math.max(1, requestedLimit - boundaryDrift);
};

export const boundedFixedCollectionDrift = ({
  productionItems,
  localItems,
  matchedIdentities,
  maximumIdentityDrift,
}: {
  productionItems: number;
  localItems: number;
  matchedIdentities: number;
  maximumIdentityDrift: number;
}): boolean =>
  maximumIdentityDrift >= 0 &&
  Math.abs(productionItems - localItems) <= maximumIdentityDrift &&
  Math.max(productionItems, localItems) - matchedIdentities <=
    maximumIdentityDrift;

export const truncatedProductionCollection = ({
  productionTotal,
  localTotal,
  productionItems,
  requestedPage,
  requestedLimit,
  exactContractMatch,
}: {
  productionTotal?: number;
  localTotal?: number;
  productionItems: number;
  requestedPage: number;
  requestedLimit: number;
  exactContractMatch: boolean;
}): boolean => {
  if (productionTotal === undefined) {
    return productionItems === 0 && !exactContractMatch;
  }
  if (localTotal === undefined || localTotal <= productionTotal) return false;

  const pageEnd =
    Math.max(0, (requestedPage - 1) * requestedLimit) + productionItems;
  const stoppedDuringRequestedPage = productionTotal <= pageEnd;
  const catastrophicallyShort =
    localTotal >= 100 &&
    localTotal >= Math.max(productionTotal * 10, productionTotal + 100);
  return stoppedDuringRequestedPage || catastrophicallyShort;
};

export const longRunningEmptySuccessFallback = ({
  productionStatus,
  productionElapsedMs,
  productionBytes,
  productionTotal,
  productionItems,
  localTotal,
  localItems,
  minimumElapsedMs = 30_000,
}: {
  productionStatus: number;
  productionElapsedMs: number;
  productionBytes: number;
  productionTotal?: number;
  productionItems: number;
  localTotal?: number;
  localItems: number;
  minimumElapsedMs?: number;
}): boolean =>
  productionStatus >= 200 &&
  productionStatus < 300 &&
  productionElapsedMs >= minimumElapsedMs &&
  productionBytes <= 64 &&
  productionTotal === 0 &&
  productionItems === 0 &&
  (localTotal ?? 0) > 0 &&
  localItems > 0;

const stableArrayKey = (value: JsonValue): string => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of [
      "id",
      "shortUUID",
      "orgId",
      "normalizedName",
      "name",
      "roundName",
      "url",
    ]) {
      const candidate = value[key];
      if (typeof candidate === "string" || typeof candidate === "number") {
        return `${key}:${String(candidate)}`;
      }
    }
  }
  return JSON.stringify(value);
};

const jobSortSignature = (item: JsonValue, orderBy: string): string => {
  const organization = record(property(item, "organization"));
  const projects = Array.isArray(organization?.projects)
    ? organization.projects
    : [];
  const primaryProject = [...projects].sort(
    (left, right) =>
      numericProperty(right, "monthlyVolume") -
      numericProperty(left, "monthlyVolume"),
  )[0];
  const fundingRounds = Array.isArray(organization?.fundingRounds)
    ? organization.fundingRounds
    : [];
  const primary: Record<string, number | null> = {
    audits: arrayLength(primaryProject, "audits"),
    hacks: arrayLength(primaryProject, "hacks"),
    chains: arrayLength(primaryProject, "chains"),
    tvl: numericProperty(primaryProject, "tvl"),
    monthlyVolume: numericProperty(primaryProject, "monthlyVolume"),
    monthlyFees: numericProperty(primaryProject, "monthlyFees"),
    monthlyRevenue: numericProperty(primaryProject, "monthlyRevenue"),
    fundingDate: Math.max(
      0,
      ...fundingRounds.map(round => numericProperty(round, "date")),
    ),
    headcountEstimate: numericProperty(organization, "headcountEstimate"),
    // The deployed service accepts teamSize but falls through to its default
    // publication-date sort.
    teamSize: nullableNumericProperty(item, "timestamp"),
    publicationDate: nullableNumericProperty(item, "timestamp"),
    salary: nullableNumericProperty(item, "salary"),
  };
  const featured = property(item, "featured") === true;
  const start = nullableNumericProperty(item, "featureStartDate");
  const end = nullableNumericProperty(item, "featureEndDate");
  return JSON.stringify([
    featured,
    featured ? start : null,
    featured && start !== null && end !== null ? end - start : null,
    Object.prototype.hasOwnProperty.call(primary, orderBy)
      ? primary[orderBy]
      : primary.publicationDate,
  ]);
};

const topLevelKeys = (items: JsonValue[]): string[] =>
  [
    ...new Set(
      items.flatMap(item => {
        const itemRecord = record(item);
        return itemRecord ? Object.keys(itemRecord) : [];
      }),
    ),
  ].sort();

const typeMap = (
  items: JsonValue[],
  collector: (value: JsonValue) => string[],
): Map<string, Set<string>> => {
  const output = new Map<string, Set<string>>();
  for (const entry of collector(items)) {
    const separator = entry.lastIndexOf(":");
    const path = entry.slice(0, separator);
    const type = entry.slice(separator + 1);
    const types = output.get(path) ?? new Set<string>();
    types.add(type);
    output.set(path, types);
  }
  return output;
};

const property = (value: JsonValue | undefined, key: string): JsonValue =>
  record(value)?.[key] ?? null;

const record = (
  value: JsonValue | undefined,
): { [key: string]: JsonValue } | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;

const nullableNumericProperty = (
  value: JsonValue | undefined,
  key: string,
): number | null => {
  const candidate = property(value, key);
  return typeof candidate === "number" ? candidate : null;
};

const numericProperty = (value: JsonValue | undefined, key: string): number =>
  nullableNumericProperty(value, key) ?? 0;

const arrayLength = (value: JsonValue | undefined, key: string): number => {
  const candidate = property(value, key);
  return Array.isArray(candidate) ? candidate.length : 0;
};

const sameStrings = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
