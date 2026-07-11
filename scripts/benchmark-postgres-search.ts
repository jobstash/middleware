import "dotenv/config";
import { performance } from "node:perf_hooks";
import { SearchDocumentRepository } from "../src/postgres/search-document.repository";
import { PostgresService } from "../src/postgres/postgres.service";

const DEFAULT_DATABASE_URL =
  "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash";
const ITERATIONS = Math.max(
  1,
  Math.floor(Number(process.env.POSTGRES_BENCHMARK_ITERATIONS ?? 5)),
);
const MAX_P95_MS = Math.max(
  1,
  Number(process.env.POSTGRES_BENCHMARK_MAX_P95_MS ?? 750),
);

type CapturedQuery = { sql: string; parameters: unknown[] };
type PlanNode = {
  "Node Type"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
};
type ExplainResult = {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
};

class BenchmarkPostgresService extends PostgresService {
  capture = false;
  captured?: CapturedQuery;

  override query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    if (this.capture) this.captured = { sql, parameters };
    return super.query<T>(sql, parameters);
  }
}

const postgres = new BenchmarkPostgresService({
  url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  maxConnections: 4,
  statementTimeoutMs: 30_000,
  applicationName: "middleware-postgres-search-benchmark",
});
const repository = new SearchDocumentRepository(postgres);

const percentile = (values: number[], quantile: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)
  ];
};

const collectIndexes = (
  node: PlanNode,
  output = new Set<string>(),
): Set<string> => {
  if (node["Index Name"]) output.add(node["Index Name"]);
  for (const child of node.Plans ?? []) collectIndexes(child, output);
  return output;
};

const benchmark = async (
  name: string,
  operation: () => Promise<unknown>,
): Promise<{
  name: string;
  p50Ms: number;
  p95Ms: number;
  explainMs: number;
  indexes: string[];
}> => {
  postgres.capture = true;
  await operation();
  postgres.capture = false;
  const captured = postgres.captured;
  if (!captured) throw new Error(`${name} did not issue a SQL query`);

  const timings: number[] = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const startedAt = performance.now();
    await operation();
    timings.push(performance.now() - startedAt);
  }
  const [row] = await postgres.query<{ "QUERY PLAN": ExplainResult[] }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${captured.sql}`,
    captured.parameters,
  );
  const explain = row["QUERY PLAN"][0];
  const result = {
    name,
    p50Ms: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    explainMs: explain["Execution Time"],
    indexes: [...collectIndexes(explain.Plan)].sort(),
  };
  console.log(JSON.stringify(result));
  if (process.env.POSTGRES_BENCHMARK_VERBOSE === "1") {
    console.log(JSON.stringify({ name, plan: explain.Plan }));
  }
  return result;
};

const main = async (): Promise<void> => {
  await postgres.onModuleInit();
  await postgres.query("ANALYZE job_search_documents");
  await postgres.query("ANALYZE organization_search_documents");
  await postgres.query("ANALYZE project_search_documents");

  const [sample] = await postgres.query<{
    tag: string | null;
    ecosystem: string | null;
    shortUuid: string;
    organizationId: string | null;
  }>(`
    SELECT tags[1] AS tag,
           managed_ecosystems[1] AS ecosystem,
           short_uuid AS "shortUuid",
           organization_id AS "organizationId"
    FROM job_search_documents
    WHERE online AND NOT blocked
      AND cardinality(tags) > 0
      AND cardinality(managed_ecosystems) > 0
    ORDER BY published_timestamp DESC NULLS LAST
    LIMIT 1
  `);
  const [word] = await postgres.query<{ value: string }>(`
    SELECT token AS value
    FROM job_search_documents,
         LATERAL regexp_split_to_table(lower(title), '[^a-z0-9]+') token
    WHERE length(token) >= 4
    GROUP BY token
    ORDER BY count(*) DESC, token
    LIMIT 1
  `);
  const [organization] = await postgres.query<{
    slug: string;
    ecosystem: string | null;
  }>(`
    SELECT slug, managed_ecosystems[1] AS ecosystem
    FROM organization_search_documents
    WHERE slug IS NOT NULL
      AND cardinality(managed_ecosystems) > 0
    ORDER BY recent_job_timestamp DESC NULLS LAST
    LIMIT 1
  `);
  const [project] = await postgres.query<{
    slug: string;
    ecosystem: string | null;
    category: string | null;
  }>(`
    SELECT slug, managed_ecosystems[1] AS ecosystem, categories[1] AS category
    FROM project_search_documents
    WHERE slug IS NOT NULL
      AND cardinality(managed_ecosystems) > 0
      AND cardinality(categories) > 0
    ORDER BY project_node_id
    LIMIT 1
  `);
  if (!sample || !organization || !project) {
    throw new Error("Search projections do not contain benchmark fixtures");
  }

  const results = [
    await benchmark("jobs-default", () =>
      repository.searchJobs({ page: 1, limit: 20, orderBy: "publicationDate" }),
    ),
    await benchmark("jobs-filtered", () =>
      repository.searchJobs({
        page: 1,
        limit: 20,
        tags: sample.tag ? [sample.tag] : undefined,
        ecosystemHeader: sample.ecosystem ?? undefined,
        orderBy: "publicationDate",
      }),
    ),
    await benchmark("jobs-full-text", () =>
      repository.searchJobs({
        page: 1,
        limit: 20,
        query: word?.value ?? "engineer",
      }),
    ),
    await benchmark("jobs-filters", () => repository.getJobFilterValues()),
    await benchmark("organizations-filtered", () =>
      repository.searchOrganizations({
        page: 1,
        limit: 20,
        ecosystemHeader: organization.ecosystem ?? undefined,
        orderBy: "recentJobDate",
      }),
    ),
    await benchmark("projects-filtered", () =>
      repository.searchProjects({
        page: 1,
        limit: 20,
        ecosystemHeader: project.ecosystem ?? undefined,
        categories: project.category ? [project.category] : undefined,
      }),
    ),
    await benchmark("job-detail", () =>
      repository.getJobByShortUuid(sample.shortUuid, { includeOffline: true }),
    ),
    await benchmark("organization-detail", () =>
      repository.getOrganizationBySlug(organization.slug),
    ),
    await benchmark("project-detail", () =>
      repository.getProjectBySlug(project.slug),
    ),
  ];

  const failures = results.filter(
    result => result.p95Ms > MAX_P95_MS || result.explainMs > MAX_P95_MS,
  );
  console.log(
    JSON.stringify({
      iterations: ITERATIONS,
      maxP95Ms: MAX_P95_MS,
      passed: failures.length === 0,
      failures: failures.map(result => result.name),
    }),
  );
  if (failures.length > 0) process.exitCode = 1;
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => postgres.onModuleDestroy());
