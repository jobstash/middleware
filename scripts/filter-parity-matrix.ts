export type MatrixPrimitive = string | number | boolean;

export type MatrixValue = {
  label: string;
  value: MatrixPrimitive;
};

export type MatrixParameter = {
  name: string;
  values: MatrixValue[];
  invalidValues?: MatrixValue[];
  pairValues?: MatrixValue[];
  interaction?: boolean;
};

export type MatrixRange = {
  minimum: string;
  maximum: string;
  lower: number;
  upper: number;
};

export type FilterEndpointSpec = {
  operationId: string;
  path: string;
  identityKey: string;
  collectionPath?: string[];
  parameters: MatrixParameter[];
  ranges?: MatrixRange[];
  headerValues?: MatrixValue[];
  headerName?: string;
  productionBaselineMayFail?: boolean;
  productionCollectionMayTruncate?: boolean;
  productionEmptySuccessMayFail?: boolean;
  productionSourceMayDrift?: boolean;
  mutableNestedKeys?: string[];
  legacyJobOrdering?: boolean;
};

export type FilterMatrixCase = {
  id: string;
  operationId: string;
  path: string;
  identityKey: string;
  collectionPath: string[];
  query: Record<string, MatrixPrimitive>;
  headers: Record<string, string>;
  coveredParameters: string[];
  kind:
    | "baseline"
    | "single"
    | "pair"
    | "range"
    | "sort"
    | "header"
    | "validation";
  productionBaselineMayFail: boolean;
};

const value = (label: string, raw: MatrixPrimitive): MatrixValue => ({
  label,
  value: raw,
});

const booleanParameter = (name: string): MatrixParameter => {
  const values = [value("true", true), value("false", false)];
  return {
    name,
    values,
    invalidValues: [value("invalid", "not-a-boolean")],
    pairValues: values,
  };
};

const numberParameter = (
  name: string,
  representative: number,
  upperBoundary: number,
): MatrixParameter => ({
  name,
  values: [
    value("zero", 0),
    value("representative", representative),
    value("upper-boundary", upperBoundary),
  ],
  invalidValues: [value("negative", -1)],
  pairValues: [value("representative", representative)],
});

const arrayParameter = (
  name: string,
  first: string,
  second: string,
): MatrixParameter => ({
  name,
  values: [
    value("one", first),
    value("two", `${first},${second}`),
    value("missing", "parity-nonexistent"),
  ],
  pairValues: [value("one", first)],
});

const enumParameter = (
  name: string,
  values: readonly string[],
  interaction = false,
): MatrixParameter => ({
  name,
  values: values.map(item => value(item, item)),
  invalidValues: [value("invalid", "parity-invalid")],
  pairValues: values.length ? [value(values[0], values[0])] : [],
  interaction,
});

const utilityNumberParameter = (
  name: string,
  values: readonly number[],
): MatrixParameter => ({
  name,
  values: values.map(item => value(String(item), item)),
  invalidValues: [value("not-a-number", "not-a-number")],
  interaction: false,
});

const queryParameter = (): MatrixParameter => ({
  name: "query",
  values: [
    value("exact", "engineer"),
    value("typo", "enginer"),
    value("missing", "parity-nonexistent"),
    value("trimmed", "  engineer  "),
    value("empty", ""),
    value("whitespace", "   "),
  ],
  pairValues: [value("exact", "engineer")],
});

const paginationParameters = (): MatrixParameter[] => [
  utilityNumberParameter("page", [1, 2, 0, -1]),
  utilityNumberParameter("limit", [1, 20, 100, 101, 0, -1]),
];

const publicationDate = enumParameter(
  "publicationDate",
  [
    "today",
    "this-week",
    "this-month",
    "past-2-weeks",
    "past-3-months",
    "past-6-months",
  ],
  true,
);

const jobParameters = (): MatrixParameter[] => [
  publicationDate,
  numberParameter("minSalaryRange", 100_000, 2_000_000),
  numberParameter("maxSalaryRange", 150_000, 2_000_001),
  numberParameter("minHeadCount", 10, 1_000),
  numberParameter("maxHeadCount", 100, 1_001),
  numberParameter("minTvl", 1_000_000, 100_000_000_000),
  numberParameter("maxTvl", 10_000_000, 100_000_000_001),
  numberParameter("minMonthlyVolume", 100_000, 1_000_000_000),
  numberParameter("maxMonthlyVolume", 1_000_000, 1_000_000_001),
  numberParameter("minMonthlyFees", 1_000, 100_000_000),
  numberParameter("maxMonthlyFees", 10_000, 100_000_001),
  numberParameter("minMonthlyRevenue", 500, 100_000_000),
  numberParameter("maxMonthlyRevenue", 5_000, 100_000_001),
  booleanParameter("audits"),
  booleanParameter("hacks"),
  arrayParameter("tags", "solidity", "typescript"),
  arrayParameter("organizations", "ripple", "agoric"),
  arrayParameter("chains", "ethereum", "base"),
  arrayParameter("ecosystems", "ethereum", "solana"),
  arrayParameter("projects", "ethereum", "uniswap"),
  arrayParameter("classifications", "engineering", "marketing"),
  arrayParameter("commitments", "fulltime", "contract"),
  arrayParameter("fundingRounds", "series-a", "seed"),
  arrayParameter("investors", "paradigm", "coinbase-ventures"),
  arrayParameter("seniority", "3", "4"),
  arrayParameter("locations", "remote", "hybrid"),
  booleanParameter("token"),
  booleanParameter("onboardIntoWeb3"),
  booleanParameter("expertJobs"),
  enumParameter("order", ["asc", "desc"]),
  enumParameter("orderBy", [
    "publicationDate",
    "tvl",
    "salary",
    "fundingDate",
    "monthlyVolume",
    "monthlyFees",
    "monthlyRevenue",
    "audits",
    "hacks",
    "chains",
    "headcountEstimate",
    "teamSize",
  ]),
  ...paginationParameters(),
  queryParameter(),
];

const jobRanges: MatrixRange[] = [
  {
    minimum: "minSalaryRange",
    maximum: "maxSalaryRange",
    lower: 100_000,
    upper: 150_000,
  },
  { minimum: "minHeadCount", maximum: "maxHeadCount", lower: 10, upper: 100 },
  { minimum: "minTvl", maximum: "maxTvl", lower: 1_000_000, upper: 10_000_000 },
  {
    minimum: "minMonthlyVolume",
    maximum: "maxMonthlyVolume",
    lower: 100_000,
    upper: 1_000_000,
  },
  {
    minimum: "minMonthlyFees",
    maximum: "maxMonthlyFees",
    lower: 1_000,
    upper: 10_000,
  },
  {
    minimum: "minMonthlyRevenue",
    maximum: "maxMonthlyRevenue",
    lower: 500,
    upper: 5_000,
  },
];

const organizationParameters = (includeHasJobs: boolean): MatrixParameter[] => [
  numberParameter("minHeadCount", 10, 1_000),
  numberParameter("maxHeadCount", 100, 1_001),
  arrayParameter("fundingRounds", "series-a", "seed"),
  arrayParameter("investors", "paradigm", "coinbase-ventures"),
  arrayParameter("locations", "berlin", "lisbon"),
  arrayParameter("ecosystems", "ethereum", "solana"),
  arrayParameter("projects", "ethereum", "uniswap"),
  arrayParameter("tags", "solidity", "typescript"),
  arrayParameter("chains", "ethereum", "base"),
  arrayParameter("names", "ripple", "agoric"),
  ...(includeHasJobs ? [booleanParameter("hasJobs")] : []),
  booleanParameter("hasProjects"),
  enumParameter("order", ["asc", "desc"]),
  enumParameter("orderBy", [
    "recentFundingDate",
    "headcountEstimate",
    ...(includeHasJobs ? [] : ["recentJobDate"]),
    "rating",
    "name",
  ]),
  ...paginationParameters(),
  queryParameter(),
];

const projectParameters = (searchAliases: boolean): MatrixParameter[] => [
  numberParameter("minTvl", 1_000_000, 100_000_000_000),
  numberParameter("maxTvl", 10_000_000, 100_000_000_001),
  numberParameter("minMonthlyVolume", 100_000, 1_000_000_000),
  numberParameter("maxMonthlyVolume", 1_000_000, 1_000_000_001),
  numberParameter("minMonthlyFees", 1_000, 100_000_000),
  numberParameter("maxMonthlyFees", 10_000, 100_000_001),
  numberParameter("minMonthlyRevenue", 500, 100_000_000),
  numberParameter("maxMonthlyRevenue", 5_000, 100_000_001),
  booleanParameter(searchAliases ? "hasAudits" : "audits"),
  booleanParameter(searchAliases ? "hasHacks" : "hacks"),
  arrayParameter("organizations", "ripple", "agoric"),
  arrayParameter("investors", "paradigm", "coinbase-ventures"),
  arrayParameter("chains", "ethereum", "base"),
  arrayParameter("categories", "defi", "infrastructure"),
  arrayParameter("ecosystems", "ethereum", "solana"),
  arrayParameter("tags", "solidity", "typescript"),
  arrayParameter("names", "ethereum", "uniswap"),
  booleanParameter(searchAliases ? "hasToken" : "token"),
  enumParameter("order", ["asc", "desc"]),
  enumParameter("orderBy", [
    "tvl",
    "monthlyVolume",
    "monthlyFees",
    "monthlyRevenue",
    "audits",
    "hacks",
    "chains",
  ]),
  ...paginationParameters(),
  queryParameter(),
];

const projectRanges: MatrixRange[] = jobRanges.filter(
  range => !["minSalaryRange", "minHeadCount"].includes(range.minimum),
);

export const FILTER_ENDPOINT_SPECS: FilterEndpointSpec[] = [
  {
    operationId: "JobsController_getJobsListWithSearch",
    path: "/jobs/list",
    identityKey: "shortUUID",
    parameters: jobParameters(),
    ranges: jobRanges,
    headerName: "x-ecosystem",
    headerValues: [
      value("bondex", "bondex"),
      value("missing", "parity-nonexistent"),
    ],
    productionSourceMayDrift: true,
    productionEmptySuccessMayFail: true,
    legacyJobOrdering: true,
  },
  {
    operationId: "PublicController_getAllJobs",
    path: "/public/jobs",
    identityKey: "shortUUID",
    parameters: jobParameters(),
    ranges: jobRanges,
    productionSourceMayDrift: true,
    productionEmptySuccessMayFail: true,
    legacyJobOrdering: true,
    productionCollectionMayTruncate: true,
  },
  {
    operationId: "PublicController_getAllJobsList",
    path: "/public/jobs/list",
    identityKey: "shortUUID",
    parameters: jobParameters(),
    ranges: jobRanges,
    productionSourceMayDrift: true,
    productionEmptySuccessMayFail: true,
    legacyJobOrdering: true,
    productionCollectionMayTruncate: true,
  },
  {
    operationId: "OrganizationsController_getOrgsListWithSearch",
    path: "/organizations/list",
    identityKey: "orgId",
    parameters: organizationParameters(false),
    ranges: [
      {
        minimum: "minHeadCount",
        maximum: "maxHeadCount",
        lower: 10,
        upper: 100,
      },
    ],
    headerName: "x-ecosystem",
    headerValues: [
      value("bondex", "bondex"),
      value("missing", "parity-nonexistent"),
    ],
    productionCollectionMayTruncate: true,
  },
  {
    operationId: "OrganizationsController_searchOrganizations",
    path: "/organizations/search",
    identityKey: "orgId",
    parameters: organizationParameters(true),
    ranges: [
      {
        minimum: "minHeadCount",
        maximum: "maxHeadCount",
        lower: 10,
        upper: 100,
      },
    ],
    headerName: "x-ecosystem",
    headerValues: [
      value("bondex", "bondex"),
      value("missing", "parity-nonexistent"),
    ],
    productionCollectionMayTruncate: true,
  },
  {
    operationId: "ProjectsController_getProjectsListWithSearch",
    path: "/projects/list",
    identityKey: "id",
    parameters: projectParameters(false),
    ranges: projectRanges,
    headerName: "x-ecosystem",
    headerValues: [
      value("bondex", "bondex"),
      value("missing", "parity-nonexistent"),
    ],
    productionBaselineMayFail: true,
    productionSourceMayDrift: true,
    mutableNestedKeys: ["jobs"],
  },
  {
    operationId: "ProjectsController_searchProjects",
    path: "/projects/search",
    identityKey: "id",
    parameters: projectParameters(true),
    ranges: projectRanges,
    headerName: "x-ecosystem",
    headerValues: [
      value("bondex", "bondex"),
      value("missing", "parity-nonexistent"),
    ],
    productionCollectionMayTruncate: true,
    productionSourceMayDrift: true,
    mutableNestedKeys: ["jobs"],
  },
  {
    operationId: "EcosystemsController_getEcosystemJobs",
    path: "/ecosystems/jobs",
    identityKey: "shortUUID",
    parameters: [
      ...jobParameters(),
      booleanParameter("blocked"),
      booleanParameter("online"),
    ],
    ranges: jobRanges,
    headerName: "x-ecosystem",
    headerValues: [
      value("bondex", "bondex"),
      value("missing", "parity-nonexistent"),
    ],
    productionSourceMayDrift: true,
    productionEmptySuccessMayFail: true,
    legacyJobOrdering: true,
  },
  {
    operationId: "ChainsController_getChainList",
    path: "/chains/list",
    identityKey: "id",
    parameters: paginationParameters(),
  },
  {
    operationId: "InvestorsController_getInvestorList",
    path: "/investors/list",
    identityKey: "id",
    parameters: paginationParameters(),
  },
];

export const generateFilterMatrix = (
  spec: FilterEndpointSpec,
  scope: "single" | "pair" = "pair",
): FilterMatrixCase[] => {
  const cases: FilterMatrixCase[] = [];
  const add = (
    id: string,
    kind: FilterMatrixCase["kind"],
    query: Record<string, MatrixPrimitive>,
    coveredParameters: string[],
    headers: Record<string, string> = {},
  ): void => {
    cases.push({
      id: `${spec.operationId}:${id}`,
      operationId: spec.operationId,
      path: spec.path,
      identityKey: spec.identityKey,
      collectionPath: spec.collectionPath ?? ["data"],
      query: { page: 1, limit: 20, ...query },
      headers,
      coveredParameters,
      kind,
      productionBaselineMayFail: spec.productionBaselineMayFail ?? false,
    });
  };

  add("baseline", "baseline", {}, []);
  for (const parameter of spec.parameters) {
    for (const item of parameter.values) {
      add(
        `single:${parameter.name}:${item.label}`,
        "single",
        { [parameter.name]: item.value },
        [parameter.name],
      );
    }
    for (const item of parameter.invalidValues ?? []) {
      add(
        `validation:${parameter.name}:${item.label}`,
        "validation",
        { [parameter.name]: item.value },
        [parameter.name],
      );
    }
  }

  for (const range of spec.ranges ?? []) {
    add(
      `range:${range.minimum}:${range.maximum}:valid`,
      "range",
      { [range.minimum]: range.lower, [range.maximum]: range.upper },
      [range.minimum, range.maximum],
    );
    add(
      `range:${range.minimum}:${range.maximum}:equal`,
      "range",
      { [range.minimum]: range.lower, [range.maximum]: range.lower },
      [range.minimum, range.maximum],
    );
    add(
      `range:${range.minimum}:${range.maximum}:invalid`,
      "range",
      { [range.minimum]: range.upper, [range.maximum]: range.lower },
      [range.minimum, range.maximum],
    );
  }

  const order = spec.parameters.find(parameter => parameter.name === "order");
  const orderBy = spec.parameters.find(
    parameter => parameter.name === "orderBy",
  );
  if (order && orderBy) {
    for (const field of orderBy.values) {
      for (const direction of order.values) {
        add(
          `sort:${field.label}:${direction.label}`,
          "sort",
          { orderBy: field.value, order: direction.value },
          ["orderBy", "order"],
        );
      }
    }
  }

  for (const item of spec.headerValues ?? []) {
    const headerName = spec.headerName;
    if (!headerName) continue;
    add(
      `header:${headerName}:${item.label}`,
      "header",
      {},
      [`header:${headerName}`],
      { [headerName]: String(item.value) },
    );
  }

  if (scope === "pair") {
    const interacting = spec.parameters.filter(
      parameter => parameter.interaction !== false,
    );
    for (let leftIndex = 0; leftIndex < interacting.length; leftIndex++) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < interacting.length;
        rightIndex++
      ) {
        const left = interacting[leftIndex];
        const right = interacting[rightIndex];
        for (const leftValue of left.pairValues ?? left.values.slice(0, 1)) {
          for (const rightValue of right.pairValues ??
            right.values.slice(0, 1)) {
            add(
              `pair:${left.name}:${leftValue.label}:${right.name}:${rightValue.label}`,
              "pair",
              {
                [left.name]: leftValue.value,
                [right.name]: rightValue.value,
              },
              [left.name, right.name],
            );
          }
        }
      }
    }
  }

  return deduplicateCases(cases);
};

const deduplicateCases = (cases: FilterMatrixCase[]): FilterMatrixCase[] => {
  const unique = new Map<string, FilterMatrixCase>();
  for (const item of cases) {
    const key = JSON.stringify([item.path, item.query, item.headers]);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, item);
      continue;
    }
    existing.coveredParameters = [
      ...new Set([...existing.coveredParameters, ...item.coveredParameters]),
    ];
  }
  return [...unique.values()];
};

export const expectedPairCoverage = (spec: FilterEndpointSpec): string[] => {
  const parameters = spec.parameters.filter(
    parameter => parameter.interaction !== false,
  );
  const pairs: string[] = [];
  for (let left = 0; left < parameters.length; left++) {
    for (let right = left + 1; right < parameters.length; right++) {
      pairs.push(`${parameters[left].name}|${parameters[right].name}`);
    }
  }
  return pairs;
};
