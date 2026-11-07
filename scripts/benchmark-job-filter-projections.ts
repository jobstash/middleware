import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { compileFunction } from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { Pool } from "pg";
import {
  SearchDocumentRepository,
  JobSearchParams,
} from "../src/postgres/search-document.repository";
import { SearchRepository } from "../src/postgres/search.repository";
import { PostgresService } from "../src/postgres/postgres.service";
import { publicationDateRangeGenerator } from "../src/shared/helpers";
import { shouldGroupJobs } from "../src/jobs/dto/job-feed.input";
import { DateRange, JobListOrderBy } from "../src/shared/types";

// Deliberately do not load dotenv. This runner must never inherit a production
// connection from a copied checkout or silently target a remote database.
const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required");
const target = new URL(databaseUrl);
if (
  process.env.ALLOW_ISOLATED_FILTER_BENCHMARK !== "1" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.slice(1).startsWith("filter_")
) {
  throw new Error(
    "This benchmark requires explicit opt-in and a loopback filter_* database",
  );
}
const iterations = Math.max(
  1,
  Number(process.env.FILTER_BENCHMARK_ITERATIONS ?? 5),
);
const poolSize = Math.max(
  1,
  Math.min(32, Number(process.env.FILTER_BENCHMARK_POOL_SIZE ?? 8)),
);
const timeoutMs = Number(
  process.env.FILTER_BENCHMARK_STATEMENT_TIMEOUT_MS ?? 5000,
);
const maxP95Ms = Number(process.env.FILTER_BENCHMARK_MAX_P95_MS ?? 3000);
const pool = new Pool({
  connectionString: databaseUrl,
  max: poolSize,
  statement_timeout: timeoutMs,
  options: "-c jit=off",
  application_name: "isolated-job-filter-benchmark",
});
type CapturedQuery = { sql: string; parameters: unknown[] };
let capture: CapturedQuery[] | undefined;
let queueWaits: number[] = [];
let slowQueries = 0;
let statementCount = 0;
const executor = {
  async query<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
    if (capture) capture.push({ sql, parameters: [...parameters] });
    const queuedAt = performance.now();
    const client = await pool.connect();
    queueWaits.push(performance.now() - queuedAt);
    const started = performance.now();
    statementCount++;
    try {
      return (await client.query(sql, parameters)).rows as T[];
    } finally {
      if (performance.now() - started >= 1000) slowQueries++;
      client.release();
    }
  },
};
const candidateRepository = new SearchDocumentRepository(
  executor as unknown as PostgresService,
);
const candidateSearch = new SearchRepository(
  executor as unknown as PostgresService,
);
let repository = candidateRepository;
let search = candidateSearch;
let baselineMode = false;
const BASELINE_SHA = "ae9e058063cc7359e7173af6e420eb510a9662cc";

function loadBaseline(): {
  repository: SearchDocumentRepository;
  search: SearchRepository;
} {
  const load = (
    path: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => {
    const filename = resolve(__dirname, "..", path);
    const source = execFileSync("git", ["show", `${BASELINE_SHA}:${path}`], {
      cwd: resolve(__dirname, ".."),
      encoding: "utf8",
    });
    const javascript = transpileModule(source, {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    }).outputText;
    const runtimeRequire = createRequire(filename);
    const module = { exports: {} };
    compileFunction(javascript, [
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
    ])(
      module.exports,
      (name: string) => overrides[name] ?? runtimeRequire(name),
      module,
      filename,
      dirname(filename),
    );
    return module.exports;
  };
  const oldDocuments = load("src/postgres/search-document.repository.ts");
  const oldSearch = load("src/postgres/search.repository.ts", {
    "./search-document.repository": oldDocuments,
  });
  const Documents =
    oldDocuments.SearchDocumentRepository as typeof SearchDocumentRepository;
  const Search = oldSearch.SearchRepository as typeof SearchRepository;
  return {
    repository: new Documents(executor as unknown as PostgresService),
    search: new Search(executor as unknown as PostgresService),
  };
}
const feed = (filters: JobSearchParams): Promise<unknown> =>
  shouldGroupJobs(filters)
    ? repository.searchJobGroups(filters)
    : repository.searchJobs(filters);
const cases: Array<{ name: string; run: () => Promise<unknown> }> = [
  {
    name: "crypto-grouped",
    run: () => feed({ organizationClassifications: ["crypto"], limit: 10 }),
  },
  {
    name: "global-count",
    run: async () =>
      baselineMode
        ? {
            totalJobs: (await repository.searchJobGroups({ limit: 1 }))
              .totalJobs,
          }
        : repository.getJobCount(),
  },
  { name: "global-facets", run: () => repository.getJobFilterValues() },
  {
    name: "latest-import",
    run: () => repository.searchLatestImportJobGroups({ limit: 10 }),
  },
  { name: "individual", run: () => repository.searchJobs({ limit: 10 }) },
  {
    name: "fuzzy-complete",
    run: () => repository.searchJobs({ query: "engineer", limit: 10 }),
  },
  {
    name: "fuzzy-long-query",
    run: () =>
      repository.searchJobs({
        query: "engineer ".repeat(28).trim(),
        limit: 10,
      }),
  },
  {
    name: "classification-wide-or",
    run: () =>
      feed({
        organizationClassifications: [
          "ai",
          "crypto",
          "fintech",
          "robotics",
          "banking",
          "tech",
          "out_of_scope",
          "unclassified",
        ],
        tags: Array.from({ length: 100 }, (_, index) =>
          index ? `missing-${index}` : "engineering",
        ),
      }),
  },
  {
    name: "title-fulltext",
    run: () => repository.searchJobs({ titleQuery: "engineer", limit: 10 }),
  },
  {
    name: "deep-page",
    run: () => repository.searchJobs({ page: 100, limit: 20 }),
  },
  {
    name: "out-of-range",
    run: () => repository.searchJobs({ page: 100000, limit: 20 }),
  },
  {
    name: "empty-job-suggestions",
    run: () =>
      search.getSuggestionItems({
        group: "jobs",
        startDate: 0,
        endDate: Date.now(),
        limit: 10,
        offset: 0,
      }),
  },
  {
    name: "empty-suggestion-groups",
    run: () => search.getSuggestionGroups("", 0, Date.now()),
  },
  {
    name: "render-query-fanout",
    run: () =>
      Promise.all([
        feed({ organizationClassifications: ["crypto"], limit: 10 }),
        baselineMode
          ? repository.searchJobGroups({ limit: 1 })
          : repository.getJobCount(),
        ...Array.from({ length: baselineMode ? 4 : 1 }, () =>
          repository.getJobFilterValues(),
        ),
      ]),
  },
];
const lists: Record<string, string[]> = {
  tags: ["engineering"],
  projects: ["protocol"],
  investors: ["investor"],
  fundingRounds: ["seed"],
  fundingStages: ["seed"],
  chains: ["ethereum"],
  ecosystems: ["ethereum"],
  classifications: ["engineering"],
  commitments: ["full-time"],
  seniority: ["3"],
  organizations: ["org-1"],
  workModes: ["fully-remote"],
  availability: ["amsterdam"],
  cities: ["amsterdam"],
  countries: ["netherlands"],
  regions: ["europe"],
  continents: ["europe"],
  timezones: ["tz:Europe/Amsterdam"],
  collaborationHours: ["utc-08"],
};
for (const [key, values] of Object.entries(lists)) {
  for (const variant of ["selected", "missing", "combined"] as const) {
    const filters: JobSearchParams = {
      [key]: variant === "missing" ? ["missing-fixture-value"] : values,
    };
    if (variant === "combined")
      filters.organizationClassifications = ["crypto"];
    cases.push({ name: `${key}-${variant}`, run: () => feed(filters) });
  }
}
for (const key of [
  "paysInCrypto",
  "offersTokenAllocation",
  "recentlyFunded",
  "onboardIntoWeb3",
  "expertJobs",
  "audits",
  "hacks",
  "token",
]) {
  for (const value of [true, false])
    cases.push({ name: `${key}-${value}`, run: () => feed({ [key]: value }) });
}
for (const [minimum, maximum] of [
  ["minSalaryRange", "maxSalaryRange"],
  ["minHeadCount", "maxHeadCount"],
  ["minTvl", "maxTvl"],
  ["minMonthlyVolume", "maxMonthlyVolume"],
  ["minMonthlyFees", "maxMonthlyFees"],
  ["minMonthlyRevenue", "maxMonthlyRevenue"],
]) {
  cases.push({
    name: minimum,
    run: () => feed({ [minimum]: 1, [maximum]: 1000000 }),
  });
}
for (const preset of [
  "today",
  "this-week",
  "this-month",
  "past-2-weeks",
  "past-3-months",
  "past-6-months",
] as DateRange[]) {
  cases.push({
    name: `date-${preset}`,
    run: () => feed(publicationDateRangeGenerator(preset)),
  });
}
for (const orderBy of [
  "publicationDate",
  "teamSize",
  "salary",
  "fundingDate",
  "headcountEstimate",
  "tvl",
  "monthlyVolume",
  "monthlyFees",
  "monthlyRevenue",
  "audits",
  "hacks",
  "chains",
] as JobListOrderBy[]) {
  for (const order of ["asc", "desc"] as const)
    cases.push({
      name: `sort-${orderBy}-${order}`,
      run: () => repository.searchJobs({ orderBy, order, limit: 10 }),
    });
}
const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ] ?? 0
  );
};

async function main(): Promise<void> {
  await candidateRepository.onModuleInit();
  const fixtureCounts = await executor.query<{
    documents: string;
    online: string;
    eligible: string;
    crypto: string;
  }>(`SELECT count(*)::text AS documents,
    count(*) FILTER(WHERE online)::text AS online,
    count(*) FILTER(WHERE online AND NOT blocked AND legacy_list_eligible
      AND cardinality(tags)>0 AND num_nonnulls(organization_id,project_id)=1
      AND NOT(access='public' AND organization_has_expert_jobs))::text AS eligible,
    count(*) FILTER(WHERE online AND employer_vertical='crypto')::text AS crypto
    FROM job_search_documents`);
  if (
    Number(fixtureCounts[0].documents) < 50000 ||
    Number(fixtureCounts[0].eligible) < 1000
  ) {
    throw new Error(
      "Benchmark requires representative populated and eligible projections",
    );
  }
  const baseline = loadBaseline();
  const parity: Array<{ name: string; matches: boolean }> = [];
  if (process.env.FILTER_BENCHMARK_PARITY === "1") {
    const canonical = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.every(item => typeof item === "string")
          ? [...value].sort()
          : value.map(canonical);
      }
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        );
      return value;
    };
    const random = Math.random;
    try {
      for (const scenario of cases.filter(
        item => item.name !== "render-query-fanout",
      )) {
        let seed = 73129;
        Math.random = (): number =>
          (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
        repository = baseline.repository;
        search = baseline.search;
        baselineMode = true;
        const oldResult = await scenario.run();
        seed = 73129;
        repository = candidateRepository;
        search = candidateSearch;
        baselineMode = false;
        const newResult = await scenario.run();
        const matches =
          JSON.stringify(canonical(oldResult)) ===
          JSON.stringify(canonical(newResult));
        parity.push({ name: scenario.name, matches });
        if (!matches)
          throw new Error(`Baseline/candidate parity failed: ${scenario.name}`);
      }
    } finally {
      Math.random = random;
    }
  }
  baselineMode = process.env.FILTER_BENCHMARK_BASELINE === "1";
  repository = baselineMode ? baseline.repository : candidateRepository;
  search = baselineMode ? baseline.search : candidateSearch;
  const plans = [];
  // Capture and explain actual repository SQL, not a simplified surrogate.
  for (const scenario of cases.slice(
    0,
    process.env.FILTER_BENCHMARK_EXPLAIN_ALL === "1" ? cases.length : 11,
  )) {
    capture = [];
    await scenario.run();
    const statements = capture;
    capture = undefined;
    for (const statement of statements) {
      const result = await executor.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.sql}`,
        statement.parameters,
      );
      plans.push({
        name: scenario.name,
        ...statement,
        plan: result[0]["QUERY PLAN"],
      });
    }
  }
  const mutations: Array<{ committed: boolean; ms: number }> = [];
  const [mutationSource] =
    process.env.FILTER_BENCHMARK_MUTATIONS === "1"
      ? await executor.query<{
          id: string;
          properties: Record<string, unknown>;
        }>(
          `SELECT node.id::text, node.properties FROM graph_nodes node
         JOIN job_search_documents job ON job.job_node_id=node.id
         WHERE node.label='StructuredJobpost' AND job.online AND NOT job.blocked
         ORDER BY node.id DESC LIMIT 1`,
        )
      : [];
  const waves = [];
  let failed = false;
  for (const concurrency of [1, 4, 16, 32]) {
    queueWaits = [];
    slowQueries = 0;
    statementCount = 0;
    let peakRssBytes = process.memoryUsage().rss;
    let next = 0;
    const samples: Array<{ name: string; ms: number; error?: string }> = [];
    const cpuStart = process.cpuUsage();
    const started = performance.now();
    const readers = Array.from({ length: concurrency }, async () => {
      while (next < cases.length * iterations) {
        const scenario = cases[next++ % cases.length];
        const begin = performance.now();
        try {
          await scenario.run();
          samples.push({
            name: scenario.name,
            ms: performance.now() - begin,
          });
        } catch (error) {
          samples.push({
            name: scenario.name,
            ms: performance.now() - begin,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      }
    });
    const writer = (async (): Promise<void> => {
      if (!mutationSource) return;
      const client = await pool.connect();
      try {
        for (let index = 0; index < 8; index++) {
          const begin = performance.now();
          await client.query("BEGIN");
          await client.query(
            "UPDATE graph_nodes SET properties=$2::jsonb || jsonb_build_object('title',$3::text) WHERE id=$1",
            [
              mutationSource.id,
              mutationSource.properties,
              `Engineering benchmark mutation ${index}`,
            ],
          );
          const committed = index % 2 === 0;
          await client.query(committed ? "COMMIT" : "ROLLBACK");
          mutations.push({ committed, ms: performance.now() - begin });
        }
      } finally {
        await client.query("ROLLBACK");
        await client.query(
          "UPDATE graph_nodes SET properties=$2::jsonb WHERE id=$1",
          [mutationSource.id, mutationSource.properties],
        );
        client.release();
      }
    })();
    await Promise.all([...readers, writer]);
    const timings = samples.map(sample => sample.ms);
    const wave = {
      concurrency,
      poolSize,
      requests: samples.length,
      elapsedMs: performance.now() - started,
      p95Ms: percentile(timings, 0.95),
      p99Ms: percentile(timings, 0.99),
      maxMs: Math.max(...timings),
      poolQueueP95Ms: percentile(queueWaits, 0.95),
      nodeCpu: process.cpuUsage(cpuStart),
      slowQueriesOver1s: slowQueries,
      statementCount,
      peakRssBytes,
      samples,
      mutations: [...mutations],
    };
    waves.push(wave);
    if (samples.some(sample => sample.error) || wave.p95Ms > maxP95Ms)
      failed = true;
  }
  console.log(
    JSON.stringify({
      mode: baselineMode ? "baseline" : "candidate",
      baselineSha: BASELINE_SHA,
      fixtureCounts: fixtureCounts[0],
      timeoutMs,
      maxP95Ms,
      parity,
      cases: cases.map(item => item.name),
      plans,
      waves,
    }),
  );
  if (failed) process.exitCode = 1;
}
main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
