import "dotenv/config";
import { createHash } from "node:crypto";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type OpenApiOperation = Record<string, JsonValue>;
type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonValue> };
};

type ReadCase = {
  path: string;
  headers?: Record<string, string>;
  collectionIdentity?: string;
  compareSemanticValue?: boolean;
};

const productionUrl = requiredUrl(
  "PARITY_PRODUCTION_URL",
  process.env.PARITY_PRODUCTION_URL ?? process.env.MW_DOMAIN,
);
const localUrl = requiredUrl(
  "PARITY_LOCAL_URL",
  process.env.PARITY_LOCAL_URL ?? "http://127.0.0.1:18080",
);
const requestTimeoutMs = Number(process.env.PARITY_TIMEOUT_MS ?? 30_000);
const basicAuthorization = `Basic ${Buffer.from(
  `${process.env.SWAGGER_USER}:${process.env.SWAGGER_PASSWORD}`,
).toString("base64")}`;

const readCases: ReadCase[] = [
  { path: "/app/health" },
  {
    path: "/jobs/list?page=1&limit=20",
    collectionIdentity: "shortUUID",
  },
  { path: "/jobs/filters", headers: { "x-ecosystem": "bondex" } },
  { path: "/jobs/details/s4jWCF", compareSemanticValue: true },
  { path: "/jobs/all?page=1&limit=5" },
  { path: "/jobs/all/filters" },
  {
    path: "/organizations/list?page=1&limit=5",
    collectionIdentity: "orgId",
  },
  { path: "/organizations/filters" },
  { path: "/organizations/details/slug/ripple" },
  {
    path: "/organizations/details/slug/agoric",
    compareSemanticValue: true,
  },
  { path: "/projects/list?page=1&limit=5", collectionIdentity: "id" },
  { path: "/projects/filters" },
  {
    path: "/projects/details/slug/ethereum",
    compareSemanticValue: true,
  },
  {
    path: "/public/jobs/list?page=1&limit=20",
    collectionIdentity: "shortUUID",
  },
  {
    path: "/public/jobs/filters",
    headers: { "x-ecosystem": "bondex" },
  },
  { path: "/tags" },
  { path: "/tags/popular?limit=5" },
  { path: "/tags/blocked" },
  { path: "/tags/preferred" },
  { path: "/tags/paired" },
  { path: "/tags/search?query=engineer" },
  { path: "/chains/list?page=1&limit=5" },
  { path: "/investors/list?page=1&limit=5" },
  { path: "/grants?status=active", collectionIdentity: "id" },
  { path: "/search?query=engineer" },
  { path: "/search/jobs/suggestions?query=engineer&page=1&limit=5" },
  { path: "/search/tags/suggestions?query=sol&page=1&limit=5" },
  { path: "/search/pillar?query=ethereum" },
  { path: "/search/pillar/items?query=ethereum" },
  { path: "/search/pillar/filters" },
  { path: "/search/pillar/labels" },
  { path: "/v2/search/pillar/slugs?query=e&page=1&limit=5" },
  { path: "/v2/search/sitemap/pillars" },
  { path: "/v2/search/sitemap/jobs" },
  {
    path: "/ecosystems/jobs?page=1&limit=5",
    headers: { "x-ecosystem": "bondex" },
  },
  {
    path: "/ecosystems/jobs/filters",
    headers: { "x-ecosystem": "bondex" },
  },
  { path: "/hacks" },
  { path: "/audits" },
];

const main = async (): Promise<void> => {
  const [productionDocument, localDocument] = await Promise.all([
    fetchJson<OpenApiDocument>(`${productionUrl}/api-json`, {
      authorization: basicAuthorization,
    }),
    fetchJson<OpenApiDocument>(`${localUrl}/api-json`, {
      authorization: basicAuthorization,
    }),
  ]);
  const contract = compareOpenApi(productionDocument, localDocument);

  const responses = [];
  for (const readCase of readCases) {
    const [production, local] = await Promise.all([
      fetchResponse(`${productionUrl}${readCase.path}`, readCase.headers),
      fetchResponse(`${localUrl}${readCase.path}`, readCase.headers),
    ]);
    const comparison = compareResponseBodies(
      production.body,
      local.body,
      readCase,
    );
    const { missingTypes, extraTypes } = comparison;
    const baselineUnavailable = production.status >= 500;
    responses.push({
      path: readCase.path,
      productionStatus: production.status,
      localStatus: local.status,
      statusMatch: production.status === local.status,
      shapeMatch: comparison.shapeMatch,
      semanticMatch: comparison.semanticMatch,
      matchedItems: comparison.matchedItems,
      productionItems: comparison.productionItems,
      localItems: comparison.localItems,
      baselineUnavailable,
      productionBytes: production.bytes,
      localBytes: local.bytes,
      missingTypeCount: missingTypes.length,
      extraTypeCount: extraTypes.length,
      missingTypes: missingTypes.slice(0, 30),
      extraTypes: extraTypes.slice(0, 30),
      productionError: production.error,
      localError: local.error,
    });
  }

  const responseFailures = responses.filter(
    response =>
      response.localStatus >= 500 ||
      (!response.baselineUnavailable &&
        (!response.statusMatch ||
          !response.shapeMatch ||
          response.semanticMatch === false)),
  );
  const unavailableBaselines = responses.filter(
    response => response.baselineUnavailable && response.localStatus < 500,
  );
  const passed = contract.passed && responseFailures.length === 0;
  console.log(
    JSON.stringify(
      {
        passed,
        productionUrl,
        localUrl,
        contract,
        responses: {
          total: responses.length,
          passed:
            responses.length -
            responseFailures.length -
            unavailableBaselines.length,
          baselineUnavailable: unavailableBaselines.map(response => ({
            path: response.path,
            productionStatus: response.productionStatus,
            localStatus: response.localStatus,
          })),
          failures: responseFailures,
          results: responses.map(response => ({
            path: response.path,
            productionStatus: response.productionStatus,
            localStatus: response.localStatus,
            statusMatch: response.statusMatch,
            shapeMatch: response.shapeMatch,
            semanticMatch: response.semanticMatch,
            matchedItems: response.matchedItems,
            productionItems: response.productionItems,
            localItems: response.localItems,
            baselineUnavailable: response.baselineUnavailable,
            missingTypeCount: response.missingTypeCount,
            extraTypeCount: response.extraTypeCount,
            productionBytes: response.productionBytes,
            localBytes: response.localBytes,
          })),
        },
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
};

const compareOpenApi = (
  production: OpenApiDocument,
  local: OpenApiDocument,
): Record<string, unknown> & { passed: boolean } => {
  const productionOperations = operations(production);
  const localOperations = operations(local);
  const missingOperations = Object.keys(productionOperations).filter(
    key => !localOperations[key],
  );
  const extraOperations = Object.keys(localOperations).filter(
    key => !productionOperations[key],
  );
  const changedOperations = Object.keys(productionOperations).filter(
    key =>
      localOperations[key] &&
      hash(productionOperations[key]) !== hash(localOperations[key]),
  );
  const productionSchemas = production.components?.schemas ?? {};
  const localSchemas = local.components?.schemas ?? {};
  const missingSchemas = Object.keys(productionSchemas).filter(
    key => !localSchemas[key],
  );
  const extraSchemas = Object.keys(localSchemas).filter(
    key => !productionSchemas[key],
  );
  const changedSchemas = Object.keys(productionSchemas).filter(
    key =>
      localSchemas[key] &&
      hash(productionSchemas[key]) !== hash(localSchemas[key]),
  );
  const passed = [
    missingOperations,
    extraOperations,
    changedOperations,
    missingSchemas,
    extraSchemas,
    changedSchemas,
  ].every(values => values.length === 0);
  return {
    passed,
    productionOperations: Object.keys(productionOperations).length,
    localOperations: Object.keys(localOperations).length,
    productionSchemas: Object.keys(productionSchemas).length,
    localSchemas: Object.keys(localSchemas).length,
    missingOperations,
    extraOperations,
    changedOperations,
    missingSchemas,
    extraSchemas,
    changedSchemas,
  };
};

const operations = (
  document: OpenApiDocument,
): Record<string, OpenApiOperation> => {
  const methods = new Set([
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "options",
    "head",
  ]);
  return Object.fromEntries(
    Object.entries(document.paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => methods.has(method))
        .map(([method, operation]) => [
          `${method.toUpperCase()} ${path}`,
          operation,
        ]),
    ),
  );
};

const fetchResponse = async (
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  bytes: number;
  types: string[];
  body: JsonValue;
  error?: string;
}> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "cache-control": "no-cache", ...headers },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: JsonValue = text;
    try {
      body = JSON.parse(text) as JsonValue;
    } catch {
      // Non-JSON errors still participate through their string type.
    }
    return {
      status: response.status,
      bytes: text.length,
      types: typePaths(body),
      body,
    };
  } catch (error) {
    return {
      status: 0,
      bytes: 0,
      types: [],
      body: null,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const compareResponseBodies = (
  production: JsonValue,
  local: JsonValue,
  readCase: ReadCase,
): {
  shapeMatch: boolean;
  semanticMatch?: boolean;
  matchedItems?: number;
  productionItems?: number;
  localItems?: number;
  missingTypes: string[];
  extraTypes: string[];
} => {
  if (!readCase.collectionIdentity) {
    const productionTypes = typePaths(production);
    const localTypes = typePaths(local);
    const missingTypes = productionTypes.filter(
      value => !localTypes.includes(value),
    );
    const extraTypes = localTypes.filter(
      value => !productionTypes.includes(value),
    );
    return {
      shapeMatch: missingTypes.length === 0 && extraTypes.length === 0,
      semanticMatch: readCase.compareSemanticValue
        ? semanticHash(production) === semanticHash(local)
        : undefined,
      missingTypes,
      extraTypes,
    };
  }

  const identityKey = readCase.collectionIdentity;
  const productionRecord = jsonRecord(production);
  const localRecord = jsonRecord(local);
  const productionItems = jsonArray(productionRecord?.data);
  const localItems = jsonArray(localRecord?.data);
  const productionEnvelope: JsonValue = productionRecord
    ? { ...productionRecord, data: [] }
    : production;
  const localEnvelope: JsonValue = localRecord
    ? { ...localRecord, data: [] }
    : local;
  const productionEnvelopeTypes = typePaths(productionEnvelope);
  const localEnvelopeTypes = typePaths(localEnvelope);
  const missingTypes = productionEnvelopeTypes.filter(
    value => !localEnvelopeTypes.includes(value),
  );
  const extraTypes = localEnvelopeTypes.filter(
    value => !productionEnvelopeTypes.includes(value),
  );
  const productionByIdentity = new Map(
    productionItems.flatMap(item => {
      const identity = jsonRecord(item)?.[identityKey];
      return typeof identity === "string" || typeof identity === "number"
        ? [[String(identity), item] as const]
        : [];
    }),
  );

  let matchedItems = 0;
  for (const localItem of localItems) {
    const identity = jsonRecord(localItem)?.[identityKey];
    if (typeof identity !== "string" && typeof identity !== "number") continue;
    const productionItem = productionByIdentity.get(String(identity));
    if (!productionItem) continue;
    matchedItems++;
    const productionItemTypes = typePaths(productionItem);
    const localItemTypes = typePaths(localItem);
    missingTypes.push(
      ...productionItemTypes
        .filter(value => !localItemTypes.includes(value))
        .map(value => `data[${String(identity)}]${value.slice(1)}`),
    );
    extraTypes.push(
      ...localItemTypes
        .filter(value => !productionItemTypes.includes(value))
        .map(value => `data[${String(identity)}]${value.slice(1)}`),
    );
  }
  if (
    productionItems.length > 0 &&
    localItems.length > 0 &&
    matchedItems === 0
  ) {
    missingTypes.push(`data[]:${identityKey}:no-common-record`);
  }

  return {
    shapeMatch: missingTypes.length === 0 && extraTypes.length === 0,
    matchedItems,
    productionItems: productionItems.length,
    localItems: localItems.length,
    missingTypes,
    extraTypes,
  };
};

const jsonRecord = (
  value: JsonValue | undefined,
): { [key: string]: JsonValue } | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;

const jsonArray = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : [];

const semanticHash = (value: JsonValue): string =>
  createHash("sha256")
    .update(JSON.stringify(normalizeSemantic(value)))
    .digest("hex");

const normalizeSemantic = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeSemantic(item))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, normalizeSemantic(value[key])]),
    );
  }
  return value;
};

const fetchJson = async <T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> => {
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  return (await response.json()) as T;
};

const typePaths = (value: JsonValue): string[] => {
  const output = new Set<string>();
  const walk = (item: JsonValue, path: string): void => {
    if (item === null) {
      output.add(`${path}:null`);
      return;
    }
    if (Array.isArray(item)) {
      output.add(`${path}:array`);
      for (const child of item.slice(0, 100)) walk(child, `${path}[]`);
      return;
    }
    const type = typeof item;
    output.add(`${path}:${type}`);
    if (type === "object") {
      for (const key of Object.keys(item).sort()) {
        walk(item[key], path === "$" ? `$.${key}` : `${path}.${key}`);
      }
    }
  };
  walk(value, "$");
  return [...output].sort();
};

const hash = (value: JsonValue | OpenApiOperation): string =>
  createHash("sha256")
    .update(JSON.stringify(sort(value)))
    .digest("hex");

const sort = (value: JsonValue | OpenApiOperation): JsonValue => {
  if (Array.isArray(value)) return value.map(item => sort(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sort(value[key] as JsonValue)]),
    );
  }
  return value as JsonValue;
};

function requiredUrl(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set`);
  return value.replace(/\/$/, "");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
