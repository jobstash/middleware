import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  FILTER_ENDPOINT_SPECS,
  FilterEndpointSpec,
  FilterMatrixCase,
  generateFilterMatrix,
} from "./filter-parity-matrix";
import {
  boundedMutableCollectionDrift,
  boundedMutableSortDrift,
  canonicalize,
  compatibleSampledContracts,
  JsonValue,
  legacyJobPageEquivalent,
  longRunningEmptySuccessFallback,
  matchingItemsSemanticallyEqual,
  semanticHash,
  truncatedProductionCollection,
} from "./filter-parity-comparison";

type OpenApiParameter = {
  name?: JsonValue;
  in?: JsonValue;
};

type OpenApiOperation = {
  operationId?: JsonValue;
  parameters?: JsonValue;
};

type OpenApiDocument = {
  paths: Record<
    string,
    Record<string, OpenApiOperation> & { parameters?: JsonValue }
  >;
};

type HttpResult = {
  status: number;
  body: JsonValue;
  bytes: number;
  elapsedMs: number;
  error?: string;
};

type CaseResult = {
  id: string;
  operationId: string;
  kind: FilterMatrixCase["kind"];
  path: string;
  productionStatus: number;
  localStatus: number;
  productionElapsedMs: number;
  localElapsedMs: number;
  productionBytes: number;
  localBytes: number;
  statusMatch: boolean;
  contractMatch: boolean;
  exactContractMatch?: boolean;
  envelopeMatch?: boolean;
  identitiesMatch?: boolean;
  identityComparison?: "exact" | "legacy-tie-equivalent" | "mismatch";
  matchedIdentityCount?: number;
  sourceDriftTolerated?: boolean;
  sortSignaturesMatch?: boolean;
  semanticMatch?: boolean;
  productionItems?: number;
  localItems?: number;
  productionTotal?: number;
  localTotal?: number;
  productionIdentitySample?: string[];
  localIdentitySample?: string[];
  missingTypes?: string[];
  extraTypes?: string[];
  valueDifferences?: string[];
  baselineUnavailable: boolean;
  baselineReason?: string;
  failureReasons: string[];
  productionError?: string;
  localError?: string;
};

type ManifestAudit = {
  operationId: string;
  productionQueryParameters: number;
  localQueryParameters: number;
  modeledParameters: number;
  generatedCases: number;
  missingFromModel: string[];
  missingLocally: string[];
  extraLocally: string[];
  emptyDomains: string[];
  passed: boolean;
};

const productionUrl = requiredUrl(
  "PARITY_PRODUCTION_URL",
  process.env.PARITY_PRODUCTION_URL ?? process.env.MW_DOMAIN,
);
const localUrl = requiredUrl(
  "PARITY_LOCAL_URL",
  process.env.PARITY_LOCAL_URL ?? "http://127.0.0.1:18080",
);
const requestTimeoutMs = Number(
  process.env.PARITY_FILTER_TIMEOUT_MS ?? 120_000,
);
const concurrency = positiveInteger(process.env.PARITY_FILTER_CONCURRENCY, 2);
const scope = process.env.PARITY_FILTER_SCOPE === "single" ? "single" : "pair";
const caseLimit = nonNegativeInteger(process.env.PARITY_FILTER_CASE_LIMIT, 0);
const caseOffset = nonNegativeInteger(process.env.PARITY_FILTER_CASE_OFFSET, 0);
const shardCount = positiveInteger(process.env.PARITY_FILTER_SHARD_COUNT, 1);
const shardIndex = nonNegativeInteger(process.env.PARITY_FILTER_SHARD_INDEX, 0);
const progressEvery = positiveInteger(
  process.env.PARITY_FILTER_PROGRESS_EVERY,
  10,
);
const reportPath = process.env.PARITY_FILTER_REPORT_PATH?.trim();
const basicAuthorization = `Basic ${Buffer.from(
  `${process.env.SWAGGER_USER}:${process.env.SWAGGER_PASSWORD}`,
).toString("base64")}`;

const selectedOperationIds = new Set(
  (process.env.PARITY_FILTER_ENDPOINTS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);
const selectedCaseIds = new Set(
  (process.env.PARITY_FILTER_CASE_IDS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);
const selectedKinds = new Set(
  (process.env.PARITY_FILTER_CASE_KINDS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);

const main = async (): Promise<void> => {
  const [productionDocument, localDocument] = await Promise.all([
    fetchJson<OpenApiDocument>(`${productionUrl}/api-json`, {
      authorization: basicAuthorization,
    }),
    fetchJson<OpenApiDocument>(`${localUrl}/api-json`, {
      authorization: basicAuthorization,
    }),
  ]);

  const specs = FILTER_ENDPOINT_SPECS.filter(
    spec =>
      selectedOperationIds.size === 0 ||
      selectedOperationIds.has(spec.operationId),
  );
  if (!specs.length) {
    throw new Error("No filter endpoint specifications matched the selection");
  }

  const manifestAudits = specs.map(spec =>
    auditManifest(spec, productionDocument, localDocument),
  );
  const manifestFailures = manifestAudits.filter(audit => !audit.passed);
  let cases = specs.flatMap(spec => generateFilterMatrix(spec, scope));
  if (selectedCaseIds.size > 0) {
    cases = cases.filter(item => selectedCaseIds.has(item.id));
    if (!cases.length) {
      throw new Error("No filter parity cases matched PARITY_FILTER_CASE_IDS");
    }
  }
  if (selectedKinds.size > 0) {
    cases = cases.filter(item => selectedKinds.has(item.kind));
  }
  if (shardIndex >= shardCount) {
    throw new Error("PARITY_FILTER_SHARD_INDEX must be below shard count");
  }
  if (shardCount > 1) {
    cases = cases.filter((_item, index) => index % shardCount === shardIndex);
  }
  if (caseOffset > 0) cases = cases.slice(caseOffset);
  if (caseLimit > 0) cases = cases.slice(0, caseLimit);
  if (!cases.length)
    throw new Error("No filter parity cases remain to execute");

  let completedCases = 0;
  const results = await mapWithConcurrency(cases, concurrency, async item => {
    const spec = specs.find(
      candidate => candidate.operationId === item.operationId,
    );
    if (!spec) throw new Error(`Missing specification for ${item.operationId}`);
    const result = await compareCase(spec, item);
    completedCases++;
    if (
      completedCases % progressEvery === 0 ||
      completedCases === cases.length
    ) {
      process.stderr.write(
        `[filter-parity] ${completedCases}/${cases.length} cases complete\n`,
      );
    }
    return result;
  });
  const failures = results.filter(result => result.failureReasons.length > 0);
  const unavailable = results.filter(result => result.baselineUnavailable);
  const passed = manifestFailures.length === 0 && failures.length === 0;

  const byOperation = specs.map(spec => {
    const operationResults = results.filter(
      result => result.operationId === spec.operationId,
    );
    return {
      operationId: spec.operationId,
      cases: operationResults.length,
      passed: operationResults.filter(result => !result.failureReasons.length)
        .length,
      failures: operationResults.filter(result => result.failureReasons.length)
        .length,
      baselineUnavailable: operationResults.filter(
        result => result.baselineUnavailable,
      ).length,
      maxProductionMs: roundedMax(
        operationResults.map(result => result.productionElapsedMs),
      ),
      maxLocalMs: roundedMax(
        operationResults.map(result => result.localElapsedMs),
      ),
    };
  });

  const report = {
    passed,
    productionUrl,
    localUrl,
    scope,
    concurrency,
    caseOffset,
    caseLimit: caseLimit || null,
    shard: { index: shardIndex, count: shardCount },
    manifest: {
      passed: manifestFailures.length === 0,
      endpoints: manifestAudits,
    },
    cases: {
      total: results.length,
      passed: results.length - failures.length,
      failures: failures.length,
      baselineUnavailable: unavailable.length,
      byOperation,
    },
    failureDetails: failures,
    unavailableBaselines: unavailable.map(result => ({
      id: result.id,
      path: result.path,
      productionStatus: result.productionStatus,
      localStatus: result.localStatus,
      productionError: result.productionError,
      baselineReason: result.baselineReason,
    })),
  };
  if (reportPath)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ...report,
        failureDetails: failures.slice(0, 100),
        unavailableBaselines: report.unavailableBaselines.slice(0, 100),
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
};

const auditManifest = (
  spec: FilterEndpointSpec,
  production: OpenApiDocument,
  local: OpenApiDocument,
): ManifestAudit => {
  const productionOperation = findOperation(production, spec.operationId);
  const localOperation = findOperation(local, spec.operationId);
  const productionQuery = parameterNames(productionOperation, "query");
  const localQuery = parameterNames(localOperation, "query");
  const modeled = new Set(spec.parameters.map(parameter => parameter.name));
  const missingFromModel = [...productionQuery].filter(
    name => !modeled.has(name),
  );
  const missingLocally = [...productionQuery].filter(
    name => !localQuery.has(name),
  );
  const extraLocally = [...localQuery].filter(
    name => !productionQuery.has(name),
  );
  const emptyDomains = spec.parameters
    .filter(parameter => parameter.values.length === 0)
    .map(parameter => parameter.name);
  return {
    operationId: spec.operationId,
    productionQueryParameters: productionQuery.size,
    localQueryParameters: localQuery.size,
    modeledParameters: modeled.size,
    generatedCases: generateFilterMatrix(spec, scope).length,
    missingFromModel,
    missingLocally,
    extraLocally,
    emptyDomains,
    passed:
      missingFromModel.length === 0 &&
      missingLocally.length === 0 &&
      extraLocally.length === 0 &&
      emptyDomains.length === 0,
  };
};

const compareCase = async (
  spec: FilterEndpointSpec,
  matrixCase: FilterMatrixCase,
): Promise<CaseResult> => {
  const path = buildPath(matrixCase);
  const [production, local] = await Promise.all([
    fetchResponse(`${productionUrl}${path}`, matrixCase.headers),
    fetchResponse(`${localUrl}${path}`, matrixCase.headers),
  ]);
  const statusMatch = production.status === local.status;
  const baselineUnavailable =
    production.status === 0 || production.status >= 500;
  const failureReasons: string[] = [];

  if (local.status === 0 || local.status >= 500) {
    failureReasons.push(`local-status:${local.status}`);
  }
  if (baselineUnavailable) {
    if (!spec.productionBaselineMayFail) {
      failureReasons.push(
        `production-baseline-unavailable:${production.status}`,
      );
    }
    return {
      id: matrixCase.id,
      operationId: matrixCase.operationId,
      kind: matrixCase.kind,
      path,
      productionStatus: production.status,
      localStatus: local.status,
      productionElapsedMs: production.elapsedMs,
      localElapsedMs: local.elapsedMs,
      productionBytes: production.bytes,
      localBytes: local.bytes,
      statusMatch,
      contractMatch: false,
      baselineUnavailable,
      failureReasons,
      productionError: production.error,
      localError: local.error,
    };
  }

  if (!statusMatch) failureReasons.push("status-mismatch");
  const productionTypes = typePaths(production.body);
  const localTypes = typePaths(local.body);
  const exactContractMatch = sameStrings(productionTypes, localTypes);
  const missingTypes = productionTypes.filter(
    path => !localTypes.includes(path),
  );
  const extraTypes = localTypes.filter(path => !productionTypes.includes(path));

  if (production.status < 200 || production.status >= 300) {
    const contractMatch = exactContractMatch;
    if (!contractMatch) failureReasons.push("contract-mismatch");
    const semanticMatch =
      semanticHash(production.body) === semanticHash(local.body);
    if (!semanticMatch) failureReasons.push("error-body-mismatch");
    return {
      id: matrixCase.id,
      operationId: matrixCase.operationId,
      kind: matrixCase.kind,
      path,
      productionStatus: production.status,
      localStatus: local.status,
      productionElapsedMs: production.elapsedMs,
      localElapsedMs: local.elapsedMs,
      productionBytes: production.bytes,
      localBytes: local.bytes,
      statusMatch,
      contractMatch,
      exactContractMatch,
      semanticMatch,
      baselineUnavailable,
      failureReasons,
      productionError: production.error,
      localError: local.error,
    };
  }

  const productionItems = collectionAt(
    production.body,
    matrixCase.collectionPath,
  );
  const localItems = collectionAt(local.body, matrixCase.collectionPath);
  const productionIdentities = identities(
    productionItems,
    matrixCase.identityKey,
  );
  const localIdentities = identities(localItems, matrixCase.identityKey);
  const exactIdentitiesMatch =
    uniqueStrings(productionIdentities) &&
    uniqueStrings(localIdentities) &&
    sameStrings(productionIdentities, localIdentities);
  const sortSignaturesMatch =
    !exactIdentitiesMatch && spec.legacyJobOrdering === true
      ? legacyJobPageEquivalent(
          productionItems,
          localItems,
          String(matrixCase.query.orderBy ?? "publicationDate"),
        )
      : false;
  const identitiesMatch = exactIdentitiesMatch || sortSignaturesMatch;
  if (!identitiesMatch) failureReasons.push("identity-order-mismatch");

  const contractMatch =
    exactContractMatch ||
    (sortSignaturesMatch &&
      compatibleSampledContracts(productionItems, localItems, typePaths));
  if (!contractMatch) failureReasons.push("contract-mismatch");

  const productionEnvelope = envelope(
    production.body,
    matrixCase.collectionPath,
  );
  const localEnvelope = envelope(local.body, matrixCase.collectionPath);
  const envelopeMatch =
    semanticHash(productionEnvelope) === semanticHash(localEnvelope);
  if (!envelopeMatch) failureReasons.push("pagination-envelope-mismatch");

  const exactMatchingItems = matchingItemsSemanticallyEqual(
    productionItems,
    localItems,
    matrixCase.identityKey,
  );
  const matchingItems = spec.mutableNestedKeys?.length
    ? matchingItemsSemanticallyEqual(
        productionItems,
        localItems,
        matrixCase.identityKey,
        spec.mutableNestedKeys,
      )
    : exactMatchingItems;
  const semanticMatch = identitiesMatch && matchingItems.equal;
  if (!semanticMatch) failureReasons.push("response-value-mismatch");
  const valueDifferences = semanticMatch
    ? []
    : collectionDifferences(
        productionItems,
        localItems,
        matrixCase.identityKey,
        30,
      );

  const productionTotal = numberProperty(production.body, "total");
  const localTotal = numberProperty(local.body, "total");
  const requestedPage = Math.max(1, Number(matrixCase.query.page ?? 1));
  const requestedLimit = Math.min(
    100,
    Math.max(1, Number(matrixCase.query.limit ?? 20)),
  );
  const mutablePayloadDriftTolerated =
    spec.productionSourceMayDrift === true &&
    identitiesMatch &&
    contractMatch &&
    envelopeMatch &&
    semanticMatch &&
    !exactMatchingItems.equal;
  const compatibleDriftContract =
    exactContractMatch ||
    compatibleSampledContracts(productionItems, localItems, typePaths);
  const mutableCollectionDriftTolerated =
    spec.productionSourceMayDrift === true &&
    compatibleDriftContract &&
    matchingItems.equal &&
    boundedMutableCollectionDrift({
      productionTotal,
      localTotal,
      productionItems: productionItems.length,
      localItems: localItems.length,
      requestedLimit,
      matchedIdentities: matchingItems.matched,
      sortSignaturesMatch,
    });
  const mutableSortDriftTolerated =
    spec.productionSourceMayDrift === true &&
    spec.mutableSortFields?.includes(
      String(matrixCase.query.orderBy ?? "publicationDate"),
    ) === true &&
    matchingItems.equal &&
    boundedMutableSortDrift({
      productionTotal,
      localTotal,
      productionItems: productionItems.length,
      localItems: localItems.length,
      requestedLimit,
      matchedIdentities: matchingItems.matched,
    });
  const sourceDriftTolerated =
    mutablePayloadDriftTolerated ||
    mutableCollectionDriftTolerated ||
    mutableSortDriftTolerated;
  if (sourceDriftTolerated) {
    const retainedFailures = failureReasons.filter(
      reason =>
        ![
          "identity-order-mismatch",
          "contract-mismatch",
          "pagination-envelope-mismatch",
          "response-value-mismatch",
        ].includes(reason),
    );
    failureReasons.splice(0, failureReasons.length, ...retainedFailures);
  }
  const productionCollectionTruncated =
    spec.productionCollectionMayTruncate === true &&
    truncatedProductionCollection({
      productionTotal,
      localTotal,
      productionItems: productionItems.length,
      requestedPage,
      requestedLimit,
      exactContractMatch,
    });
  const productionServiceFallback =
    (spec.productionBaselineMayFail === true ||
      spec.productionCollectionMayTruncate === true) &&
    numberProperty(production.body, "page") === -1 &&
    productionItems.length === 0;
  const productionLongEmptySuccessFallback =
    spec.productionEmptySuccessMayFail === true &&
    longRunningEmptySuccessFallback({
      productionStatus: production.status,
      productionElapsedMs: production.elapsedMs,
      productionBytes: production.bytes,
      productionTotal,
      productionItems: productionItems.length,
      localTotal,
      localItems: localItems.length,
    });
  if (
    productionCollectionTruncated ||
    productionServiceFallback ||
    productionLongEmptySuccessFallback
  ) {
    const nonSemanticFailures = failureReasons.filter(
      reason =>
        reason === "status-mismatch" || reason.startsWith("local-status:"),
    );
    failureReasons.splice(0, failureReasons.length, ...nonSemanticFailures);
  }

  return {
    id: matrixCase.id,
    operationId: matrixCase.operationId,
    kind: matrixCase.kind,
    path,
    productionStatus: production.status,
    localStatus: local.status,
    productionElapsedMs: production.elapsedMs,
    localElapsedMs: local.elapsedMs,
    productionBytes: production.bytes,
    localBytes: local.bytes,
    statusMatch,
    contractMatch,
    exactContractMatch,
    envelopeMatch,
    identitiesMatch,
    identityComparison: exactIdentitiesMatch
      ? "exact"
      : sortSignaturesMatch
        ? "legacy-tie-equivalent"
        : "mismatch",
    matchedIdentityCount: matchingItems.matched,
    sourceDriftTolerated,
    sortSignaturesMatch,
    semanticMatch,
    productionItems: productionItems.length,
    localItems: localItems.length,
    productionTotal,
    localTotal,
    productionIdentitySample: productionIdentities.slice(0, 20),
    localIdentitySample: localIdentities.slice(0, 20),
    missingTypes: missingTypes.slice(0, 30),
    extraTypes: extraTypes.slice(0, 30),
    valueDifferences,
    baselineUnavailable:
      baselineUnavailable ||
      productionCollectionTruncated ||
      productionServiceFallback ||
      productionLongEmptySuccessFallback,
    baselineReason: productionServiceFallback
      ? "live-production-service-fallback"
      : productionLongEmptySuccessFallback
        ? "live-production-long-empty-success-fallback"
        : productionCollectionTruncated
          ? "live-production-collection-truncated-during-entity-mapping"
          : undefined,
    failureReasons,
    productionError: production.error,
    localError: local.error,
  };
};

const buildPath = (matrixCase: FilterMatrixCase): string => {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(matrixCase.query)) {
    query.set(name, String(value));
  }
  return `${matrixCase.path}?${query.toString()}`;
};

const fetchResponse = async (
  url: string,
  caseHeaders: Record<string, string>,
): Promise<HttpResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: { "cache-control": "no-cache", ...caseHeaders },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: JsonValue = text;
    try {
      body = JSON.parse(text) as JsonValue;
    } catch {
      // Text responses still participate in status and contract comparison.
    }
    return {
      status: response.status,
      body,
      bytes: Buffer.byteLength(text),
      elapsedMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 0,
      body: null,
      bytes: 0,
      elapsedMs: performance.now() - startedAt,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const findOperation = (
  document: OpenApiDocument,
  operationId: string,
): OpenApiOperation => {
  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (
        operation &&
        typeof operation === "object" &&
        !Array.isArray(operation) &&
        operation.operationId === operationId
      ) {
        return operation;
      }
    }
  }
  throw new Error(`OpenAPI operation not found: ${operationId}`);
};

const parameterNames = (
  operation: OpenApiOperation,
  location: string,
): Set<string> =>
  new Set(
    (Array.isArray(operation.parameters) ? operation.parameters : []).flatMap(
      parameter => {
        const record = jsonRecord(parameter) as OpenApiParameter | undefined;
        return record?.in === location && typeof record.name === "string"
          ? [record.name]
          : [];
      },
    ),
  );

const collectionAt = (value: JsonValue, path: string[]): JsonValue[] => {
  let current: JsonValue | undefined = value;
  for (const key of path) current = jsonRecord(current)?.[key];
  return Array.isArray(current) ? current : [];
};

const envelope = (value: JsonValue, path: string[]): JsonValue =>
  replaceAtPath(value, path, []);

const replaceAtPath = (
  value: JsonValue,
  path: string[],
  replacement: JsonValue,
): JsonValue => {
  if (!path.length) return replacement;
  const record = jsonRecord(value);
  if (!record) return value;
  const [key, ...remaining] = path;
  return {
    ...record,
    [key]: replaceAtPath(record[key] ?? null, remaining, replacement),
  };
};

const identities = (items: JsonValue[], key: string): string[] =>
  items.map((item, index) => {
    const identity = jsonRecord(item)?.[key];
    return typeof identity === "string" || typeof identity === "number"
      ? String(identity)
      : `<missing:${index}>`;
  });

const collectionDifferences = (
  productionItems: JsonValue[],
  localItems: JsonValue[],
  identityKey: string,
  limit: number,
): string[] => {
  const localByIdentity = new Map(
    localItems.map(item => [identityOf(item, identityKey), item]),
  );
  const differences: string[] = [];
  for (const productionItem of productionItems) {
    const identity = identityOf(productionItem, identityKey);
    const localItem = localByIdentity.get(identity);
    if (!localItem) continue;
    collectDifferences(
      canonicalize(productionItem),
      canonicalize(localItem),
      `$[${identity}]`,
      differences,
      limit,
    );
    if (differences.length >= limit) break;
  }
  return differences;
};

const identityOf = (item: JsonValue, key: string): string => {
  const identity = jsonRecord(item)?.[key];
  return typeof identity === "string" || typeof identity === "number"
    ? String(identity)
    : "<missing>";
};

const collectDifferences = (
  production: JsonValue | undefined,
  local: JsonValue | undefined,
  path: string,
  output: string[],
  limit: number,
): void => {
  if (output.length >= limit) return;
  if (production === undefined || local === undefined) {
    output.push(
      `${path}: ${production === undefined ? "missing-production" : "missing-local"}`,
    );
    return;
  }
  if (Array.isArray(production) || Array.isArray(local)) {
    if (!Array.isArray(production) || !Array.isArray(local)) {
      output.push(`${path}: collection-type-mismatch`);
      return;
    }
    if (production.length !== local.length) {
      output.push(
        `${path}.length: production=${production.length} local=${local.length}`,
      );
    }
    const length = Math.min(production.length, local.length);
    for (let index = 0; index < length && output.length < limit; index++) {
      collectDifferences(
        production[index],
        local[index],
        `${path}[${index}]`,
        output,
        limit,
      );
    }
    return;
  }
  const productionRecord = jsonRecord(production);
  const localRecord = jsonRecord(local);
  if (productionRecord || localRecord) {
    if (!productionRecord || !localRecord) {
      output.push(`${path}: object-type-mismatch`);
      return;
    }
    const keys = new Set([
      ...Object.keys(productionRecord),
      ...Object.keys(localRecord),
    ]);
    for (const key of [...keys].sort()) {
      collectDifferences(
        productionRecord[key],
        localRecord[key],
        `${path}.${key}`,
        output,
        limit,
      );
      if (output.length >= limit) break;
    }
    return;
  }
  if (!Object.is(production, local)) {
    output.push(
      `${path}: production=${shortValue(production)} local=${shortValue(local)}`,
    );
  }
};

const shortValue = (value: JsonValue): string => {
  const serialized = JSON.stringify(value);
  return serialized.length <= 120
    ? serialized
    : `${serialized.slice(0, 117)}...`;
};

const numberProperty = (value: JsonValue, key: string): number | undefined => {
  const property = jsonRecord(value)?.[key];
  return typeof property === "number" ? property : undefined;
};

const jsonRecord = (
  value: JsonValue | undefined,
): { [key: string]: JsonValue } | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;

const typePaths = (value: JsonValue): string[] => {
  const paths: string[] = [];
  const visit = (current: JsonValue, path: string): void => {
    if (Array.isArray(current)) {
      paths.push(`${path}:array`);
      for (const item of current) visit(item, `${path}[]`);
      return;
    }
    if (current === null) {
      paths.push(`${path}:null`);
      return;
    }
    if (typeof current === "object") {
      paths.push(`${path}:object`);
      for (const key of Object.keys(current).sort()) {
        visit(current[key], `${path}.${key}`);
      }
      return;
    }
    paths.push(`${path}:${typeof current}`);
  };
  visit(value, "$");
  return [...new Set(paths)].sort();
};

const sameStrings = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const uniqueStrings = (values: string[]): boolean =>
  new Set(values).size === values.length;

const mapWithConcurrency = async <T, R>(
  items: T[],
  workerCount: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> => {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(workerCount, items.length) }, worker),
  );
  return output;
};

const fetchJson = async <T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
};

const roundedMax = (values: number[]): number =>
  Math.round(Math.max(0, ...values) * 100) / 100;

function requiredUrl(name: string, raw: string | undefined): string {
  if (!raw) throw new Error(`${name} is required`);
  return raw.replace(/\/$/, "");
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

void main();
