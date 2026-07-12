import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

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

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RuntimeCase = {
  path: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: JsonValue;
  collectionIdentity?: string;
  collectionPath?: string[];
  requireCommonIdentity?: boolean;
  compareSemanticValue?: boolean;
  compareXmlLocations?: boolean;
  kind?: "data" | "authorization";
};

type OperationEntry = {
  key: string;
  method: HttpMethod;
  path: string;
  operationId: string;
  operation: OpenApiOperation;
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

const runtimeCases: RuntimeCase[] = [
  { path: "/app/health" },
  { path: "/app/diff" },
  { path: "/app/sitemap", compareXmlLocations: true },
  { path: "/app/sitemap/ev", compareXmlLocations: true },
  {
    path: "/jobs/list?page=1&limit=20",
    collectionIdentity: "shortUUID",
  },
  { path: "/jobs/filters", headers: { "x-ecosystem": "bondex" } },
  { path: "/jobs/details/s4jWCF", compareSemanticValue: true },
  { path: "/jobs/similar/s4jWCF", compareSemanticValue: true },
  {
    path: "/jobs/suggested?skills=solidity&isExpert=false&page=1&limit=2",
    collectionIdentity: "shortUUID",
    collectionPath: ["data", "data"],
  },
  {
    path: "/jobs/match/s4jWCF?skills=solidity&isExpert=false",
    compareSemanticValue: true,
  },
  { path: "/jobs/org/2433" },
  { path: "/jobs/folders/parity-nonexistent" },
  { path: "/jobs/all?page=1&limit=5" },
  { path: "/jobs/all/filters" },
  {
    path: "/organizations/list?page=1&limit=5",
    collectionIdentity: "orgId",
    requireCommonIdentity: false,
  },
  { path: "/organizations/filters" },
  {
    path: "/organizations/search?query=agoric&page=1&limit=5",
    collectionIdentity: "orgId",
  },
  {
    path: "/organizations/id/ripple.com",
    compareSemanticValue: true,
  },
  { path: "/organizations/details/2433", compareSemanticValue: true },
  { path: "/organizations/details/slug/ripple" },
  {
    path: "/organizations/details/slug/agoric",
    compareSemanticValue: true,
  },
  { path: "/projects/list?page=1&limit=5", collectionIdentity: "id" },
  { path: "/projects/filters" },
  {
    path: "/projects/id/ethereum.org",
    compareSemanticValue: true,
  },
  {
    path: "/projects/details/3ddb19aa-e79e-461d-874d-0e42534eecae",
    compareSemanticValue: true,
  },
  {
    path: "/projects/details/slug/ethereum",
    compareSemanticValue: true,
  },
  {
    path: "/projects/category/Dexes",
    collectionIdentity: "id",
    compareSemanticValue: true,
  },
  {
    path: "/projects/competitors/8d4300f6-77f0-4699-a8d0-a9e3199ad836",
    collectionIdentity: "id",
  },
  {
    path: "/projects/search?query=ethereum&page=1&limit=5",
    collectionIdentity: "id",
  },
  {
    path: "/public/jobs?page=1&limit=20",
    collectionIdentity: "shortUUID",
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
  {
    method: "POST",
    path: "/tags/match",
    body: { tags: ["solidity", "typescript", "not-a-real-skill"] },
    compareSemanticValue: true,
  },
  {
    method: "POST",
    path: "/tags/batch-match",
    body: { tags: ["solidity", "typescript"], maxResults: 5 },
    compareSemanticValue: true,
  },
  { path: "/chains/list?page=1&limit=5" },
  {
    path: "/chains/details/slug/ethereum",
    compareSemanticValue: true,
  },
  { path: "/investors/list?page=1&limit=5" },
  {
    path: "/investors/details/slug/paradigm",
    compareSemanticValue: true,
  },
  { path: "/grants?status=active", collectionIdentity: "id" },
  {
    path: "/grants/thankarb-arbitrium",
    compareSemanticValue: true,
  },
  {
    path: "/grants/arbitrum-stip/grantees?page=1&limit=5",
    collectionIdentity: "id",
  },
  {
    path: "/grants/arbitrum-stip/grantees/parity-nonexistent",
    compareSemanticValue: true,
  },
  { path: "/search?query=engineer" },
  { path: "/search/jobs/suggestions?query=engineer&page=1&limit=5" },
  { path: "/search/tags/suggestions?query=sol&page=1&limit=5" },
  { path: "/search/pillar?query=ethereum" },
  { path: "/search/pillar/items?query=ethereum" },
  { path: "/search/pillar/filters" },
  { path: "/search/pillar/labels" },
  { path: "/search/pillar/slugs?nav=categories" },
  { path: "/search/pillar/details?nav=categories&slug=engineering" },
  {
    path: "/search/pillar/page/static/jobs-in-engineering",
    compareSemanticValue: true,
  },
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
  {
    path: "/white-label-boards/public/orgs?page=1&limit=5",
    headers: { "x-white-label-board-route": "jobstash" },
    collectionIdentity: "orgId",
  },
  {
    path: "/white-label-boards/public/jobs?page=1&limit=5",
    headers: { "x-white-label-board-route": "jobstash" },
    collectionIdentity: "shortUUID",
  },
];

const liveProbeExclusions = new Map<string, string>([
  ["StripeController_handleWebhook", "requires a signed Stripe event"],
  ["JobsController_promoteJob", "charges or mutates a job promotion"],
  ["AuthController_sendDevMagicLink", "writes email state and sends mail"],
  ["AuthController_verifyDevMagicLink", "consumes an external auth callback"],
  ["AuthController_updateUserMainEmail", "modifies user email state"],
  ["AuthController_removeUserEmail", "modifies user email state"],
  ["ProfileController_reportReview", "sends an external moderation report"],
  ["PrivyController_handleWebhook", "requires a signed Privy event"],
  ["GrantsController_query", "calls the external embedding API"],
  ["GrantsController_sendMail", "sends external email"],
]);

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
  const entries = operationEntries(localDocument);
  const resolvedRuntimeCases = runtimeCases.map(runtimeCase => ({
    runtimeCase,
    entry: resolveOperation(entries, runtimeCase),
  }));
  const runtimeOperationIds = new Set(
    resolvedRuntimeCases.map(({ entry }) => entry.operationId),
  );
  const protectedOperationIds = discoverProtectedOperationIds();
  const unknownProtectedOperations = [...protectedOperationIds].filter(
    operationId => !entries.some(entry => entry.operationId === operationId),
  );
  const unknownExclusions = [...liveProbeExclusions.keys()].filter(
    operationId => !entries.some(entry => entry.operationId === operationId),
  );
  const authorizationCases = entries
    .filter(
      entry =>
        protectedOperationIds.has(entry.operationId) &&
        !runtimeOperationIds.has(entry.operationId) &&
        !liveProbeExclusions.has(entry.operationId),
    )
    .map(entry => ({
      entry,
      runtimeCase: {
        method: entry.method,
        path: materializePath(entry.path),
        body: entry.method === "GET" ? undefined : {},
        compareSemanticValue: true,
        kind: "authorization" as const,
      },
    }));
  const coveredOperationIds = new Set([
    ...runtimeOperationIds,
    ...authorizationCases.map(({ entry }) => entry.operationId),
    ...liveProbeExclusions.keys(),
  ]);
  const uncoveredOperations = entries
    .filter(entry => !coveredOperationIds.has(entry.operationId))
    .map(entry => entry.key);
  const coverage = {
    passed:
      uncoveredOperations.length === 0 &&
      unknownProtectedOperations.length === 0 &&
      unknownExclusions.length === 0,
    operations: entries.length,
    dataProbes: resolvedRuntimeCases.length,
    distinctDataOperations: runtimeOperationIds.size,
    authorizationProbes: authorizationCases.length,
    excludedLiveProbes: [...liveProbeExclusions].map(
      ([operationId, reason]) => ({ operationId, reason }),
    ),
    uncoveredOperations,
    unknownProtectedOperations,
    unknownExclusions,
  };

  const dataResponses = [];
  for (const resolved of resolvedRuntimeCases) {
    dataResponses.push(await compareRuntimeCase(resolved));
  }
  const authorizationResponses = await mapWithConcurrency(
    authorizationCases,
    12,
    compareRuntimeCase,
  );
  const responses = [...dataResponses, ...authorizationResponses];

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
  const passed =
    contract.passed && coverage.passed && responseFailures.length === 0;
  console.log(
    JSON.stringify(
      {
        passed,
        productionUrl,
        localUrl,
        contract,
        coverage,
        responses: {
          total: responses.length,
          passed:
            responses.length -
            responseFailures.length -
            unavailableBaselines.length,
          baselineUnavailable: unavailableBaselines.map(response => ({
            operationId: response.operationId,
            method: response.method,
            path: response.path,
            productionStatus: response.productionStatus,
            localStatus: response.localStatus,
          })),
          failures: responseFailures,
          results: responses.map(response => ({
            operationId: response.operationId,
            kind: response.kind,
            method: response.method,
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

const compareRuntimeCase = async ({
  entry,
  runtimeCase,
}: {
  entry: OperationEntry;
  runtimeCase: RuntimeCase;
}) => {
  const [production, local] = await Promise.all([
    fetchResponse(`${productionUrl}${runtimeCase.path}`, runtimeCase),
    fetchResponse(`${localUrl}${runtimeCase.path}`, runtimeCase),
  ]);
  const comparison = compareResponseBodies(
    production.body,
    local.body,
    runtimeCase,
  );
  const { missingTypes, extraTypes } = comparison;
  return {
    operationId: entry.operationId,
    kind: runtimeCase.kind ?? "data",
    method: runtimeCase.method ?? "GET",
    path: runtimeCase.path,
    productionStatus: production.status,
    localStatus: local.status,
    statusMatch: production.status === local.status,
    shapeMatch: comparison.shapeMatch,
    semanticMatch: comparison.semanticMatch,
    matchedItems: comparison.matchedItems,
    productionItems: comparison.productionItems,
    localItems: comparison.localItems,
    baselineUnavailable: production.status === 0 || production.status >= 500,
    productionBytes: production.bytes,
    localBytes: local.bytes,
    missingTypeCount: missingTypes.length,
    extraTypeCount: extraTypes.length,
    missingTypes: missingTypes.slice(0, 30),
    extraTypes: extraTypes.slice(0, 30),
    productionError: production.error,
    localError: local.error,
  };
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

const operationEntries = (document: OpenApiDocument): OperationEntry[] => {
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).flatMap(([method, operation]) => {
      if (!methods.has(method)) return [];
      const operationId = operation.operationId;
      if (typeof operationId !== "string") {
        throw new Error(`${method.toUpperCase()} ${path} has no operationId`);
      }
      return [
        {
          key: `${method.toUpperCase()} ${path}`,
          method: method.toUpperCase() as HttpMethod,
          path,
          operationId,
          operation,
        },
      ];
    }),
  );
};

const resolveOperation = (
  entries: OperationEntry[],
  runtimeCase: RuntimeCase,
): OperationEntry => {
  const method = runtimeCase.method ?? "GET";
  const path = new URL(runtimeCase.path, "http://parity.local").pathname;
  const exactMatches = entries.filter(
    entry => entry.method === method && entry.path === path,
  );
  if (exactMatches.length === 1) return exactMatches[0];
  const matches = entries.filter(
    entry => entry.method === method && templatePattern(entry.path).test(path),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${method} ${path} resolved to ${matches.length} OpenAPI operations`,
    );
  }
  return matches[0];
};

const templatePattern = (path: string): RegExp =>
  new RegExp(
    `^${path
      .split("/")
      .map(segment =>
        /^\{[^}]+\}$/.test(segment)
          ? "[^/]+"
          : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/")}$`,
  );

const materializePath = (path: string): string =>
  path.replace(/\{[^}]+\}/g, "parity-probe");

const discoverProtectedOperationIds = (): Set<string> => {
  const operationIds = new Set<string>();
  for (const file of controllerFiles(join(process.cwd(), "src"))) {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    sourceFile.forEachChild(node => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) continue;
        const decorators = nodeDecorators(member);
        const names = decorators.map(decoratorName);
        const permissionGuarded =
          names.includes("Permissions") && names.includes("UseGuards");
        const externalGuarded = decorators.some(decorator => {
          const expression = decorator.expression;
          return (
            ts.isCallExpression(expression) &&
            expression.expression.getText(sourceFile) === "UseGuards" &&
            /ApiKeyGuard|PrivyGuard|AuthGuard/.test(
              expression.arguments
                .map(argument => argument.getText(sourceFile))
                .join(","),
            )
          );
        });
        if (permissionGuarded || externalGuarded) {
          operationIds.add(
            `${node.name.text}_${member.name.getText(sourceFile)}`,
          );
        }
      }
    });
  }
  return operationIds;
};

const controllerFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith(".controller.ts") ? [path] : [];
  });

const nodeDecorators = (node: ts.Node): readonly ts.Decorator[] =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];

const decoratorName = (decorator: ts.Decorator): string => {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    ? expression.expression.getText()
    : expression.getText();
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
};

const fetchResponse = async (
  url: string,
  runtimeCase: RuntimeCase,
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
    const headers: Record<string, string> = {
      "cache-control": "no-cache",
      ...runtimeCase.headers,
    };
    if (runtimeCase.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await fetch(url, {
      method: runtimeCase.method ?? "GET",
      headers,
      body:
        runtimeCase.body === undefined
          ? undefined
          : JSON.stringify(runtimeCase.body),
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
  runtimeCase: RuntimeCase,
): {
  shapeMatch: boolean;
  semanticMatch?: boolean;
  matchedItems?: number;
  productionItems?: number;
  localItems?: number;
  missingTypes: string[];
  extraTypes: string[];
} => {
  if (runtimeCase.compareXmlLocations) {
    const productionLocations = xmlLocations(production);
    const localLocations = xmlLocations(local);
    const localSet = new Set(localLocations);
    const productionSet = new Set(productionLocations);
    const matchedItems = productionLocations.filter(location =>
      localSet.has(location),
    ).length;
    const denominator = Math.max(
      productionLocations.length,
      localLocations.length,
      1,
    );
    const overlap = matchedItems / denominator;
    const missingTypes = productionLocations
      .filter(location => !localSet.has(location))
      .map(location => `xml:missing:${location}`);
    const extraTypes = localLocations
      .filter(location => !productionSet.has(location))
      .map(location => `xml:extra:${location}`);
    return {
      shapeMatch:
        productionLocations.length > 0 &&
        localLocations.length > 0 &&
        overlap >= 0.99,
      matchedItems,
      productionItems: productionLocations.length,
      localItems: localLocations.length,
      missingTypes,
      extraTypes,
    };
  }

  if (!runtimeCase.collectionIdentity) {
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
      semanticMatch: runtimeCase.compareSemanticValue
        ? semanticHash(production) === semanticHash(local)
        : undefined,
      missingTypes,
      extraTypes,
    };
  }

  const identityKey = runtimeCase.collectionIdentity;
  const collectionPath = runtimeCase.collectionPath ?? ["data"];
  const productionItems = jsonArray(valueAtPath(production, collectionPath));
  const localItems = jsonArray(valueAtPath(local, collectionPath));
  const productionEnvelope = replaceAtPath(production, collectionPath, []);
  const localEnvelope = replaceAtPath(local, collectionPath, []);
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
    matchedItems === 0 &&
    runtimeCase.requireCommonIdentity !== false
  ) {
    missingTypes.push(`data[]:${identityKey}:no-common-record`);
  }

  return {
    shapeMatch: missingTypes.length === 0 && extraTypes.length === 0,
    matchedItems,
    productionItems: productionItems.length,
    localItems: localItems.length,
    semanticMatch: runtimeCase.compareSemanticValue
      ? semanticHash(production) === semanticHash(local)
      : undefined,
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

const xmlLocations = (value: JsonValue): string[] => {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
};

const valueAtPath = (
  value: JsonValue,
  path: string[],
): JsonValue | undefined => {
  let current: JsonValue | undefined = value;
  for (const key of path) current = jsonRecord(current)?.[key];
  return current;
};

const replaceAtPath = (
  value: JsonValue,
  path: string[],
  replacement: JsonValue,
): JsonValue => {
  if (path.length === 0) return replacement;
  const record = jsonRecord(value);
  if (!record) return value;
  const [key, ...remaining] = path;
  return {
    ...record,
    [key]: replaceAtPath(record[key] ?? null, remaining, replacement),
  };
};

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
