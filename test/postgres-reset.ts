import { isIP } from "node:net";
import type { EntityManager } from "typeorm";
import type { PostgresService } from "../src/postgres/postgres.service";

const localHosts = ["localhost", "127.0.0.1", "[::1]"];
const isolatedName =
  /^(?:[a-z0-9_]*(?:test|fixture)|filter_projection_[a-z0-9_]+)$/;

/** Fail closed before connecting; never include connection URLs in errors. */
export function assertFixtureEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): URL {
  if (
    [env.NODE_ENV, env.APP_ENV].some(value =>
      /^(prod|production)$/i.test(value?.trim() ?? ""),
    )
  ) {
    throw new Error("Fixture reset refuses a production environment");
  }
  const parse = (value: string | undefined): URL => {
    let url: URL;
    try {
      url = new URL(value ?? "");
    } catch {
      throw new Error(
        "Fixture reset requires an explicit local DATABASE_TEST_URL",
      );
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !localHosts.includes(url.hostname) ||
      !isolatedName.test(url.pathname.slice(1)) ||
      /(?:^|_)(?:prod|production)(?:_|$)/i.test(url.pathname.slice(1)) ||
      !url.username ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Fixture reset requires a local isolated test/fixture database without URL overrides",
      );
    }
    return url;
  };
  const expected = parse(env.DATABASE_TEST_URL);
  // A production primary URL is never acceptable, even when a test URL is set.
  if (env.DATABASE_URL) parse(env.DATABASE_URL);
  return expected;
}

export interface FixtureConnectionIdentity {
  database: string;
  current_user: string;
  session_user: string;
  client_address: string | null;
  server_address: string | null;
}

function localAddress(address: string | null): boolean {
  if (!address || !isIP(address)) return false;
  if (address === "::1") return true;
  const ipv4 = address.replace(/^::ffff:/, "");
  const parts = ipv4.split(".").map(Number);
  // Docker Desktop forwards localhost connections through an RFC1918 bridge.
  return (
    isIP(ipv4) === 4 &&
    (parts[0] === 127 ||
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}

export function assertFixtureConnection(
  expected: URL,
  actual: FixtureConnectionIdentity,
): void {
  if (
    actual.database !== expected.pathname.slice(1) ||
    actual.current_user !== decodeURIComponent(expected.username) ||
    actual.session_user !== actual.current_user ||
    !localAddress(actual.client_address) ||
    !localAddress(actual.server_address)
  ) {
    throw new Error(
      "Fixture reset connection identity or local network metadata does not match DATABASE_TEST_URL",
    );
  }
}

const coreBody =
  "BEGIN RAISE EXCEPTION 'TRUNCATE bypasses search dependency invalidation; use transactional DELETE or isolated schema recreation'; END";
const referenceBody =
  "BEGIN RAISE EXCEPTION 'TRUNCATE of % bypasses search projection invalidation; use transactional DELETE', TG_TABLE_NAME; END";
const guards = [
  ...[
    "graph_nodes",
    "graph_relationships",
    "job_availability_evidence",
    "job_availability_extractions",
    "job_work_location_options",
    "jobpost_import_runs",
    "jobpost_import_run_items",
    "jobpost_import_run_discoveries",
  ].map(table => ({
    table,
    name: "search_projection_truncate_guard",
    functionName: "reject_untracked_search_projection_truncate",
    body: coreBody,
  })),
  ...[
    ["place_reference", "place_reference_search_projection_truncate"],
    ["place_aliases", "place_aliases_search_projection_truncate"],
    [
      "team_collaboration_bands",
      "team_collaboration_search_projection_truncate",
    ],
  ].map(([table, name]) => ({
    table,
    name,
    functionName: "reject_reference_projection_truncate",
    body: referenceBody,
  })),
];

const fixtureTables = [
  "graph_nodes",
  "place_reference",
  "entity_enrichment_runs",
  "entity_collisions",
  "entity_review_runs",
  "entity_review_decisions",
  "structured_job_refresh_runs",
  "organization_jobsite_runs",
  "jobpost_import_runs",
  "job_market_date_requests",
  "work_arrangement_runs",
  "inference_runs",
  "job_market_salary_observation_pillars",
  "job_market_skill_weekly_metrics",
  "job_market_skill_signal_history",
  "job_market_geography_metrics",
  "job_market_salary_exclusions",
  "job_market_salary_observations",
  "job_market_daily_metrics",
  "job_market_pillars",
  "job_market_fx_rates",
  "job_market_runs",
];

function fixtureTruncate(sql: string): string {
  const match =
    /^\s*TRUNCATE\s+(?:TABLE\s+)?([a-z_]+(?:\s*,\s*[a-z_]+)*)\s+(RESTART\s+IDENTITY\s+)?CASCADE\s*$/i.exec(
      sql,
    );
  if (
    !match ||
    match[1]
      .split(",")
      .map(table => table.trim())
      .some(table => !fixtureTables.includes(table))
  ) {
    throw new Error(
      "Fixture reset accepts only a single fixed allowlisted TRUNCATE statement",
    );
  }
  return `TRUNCATE TABLE ${match[1]
    .split(",")
    .map(table => `public.${table.trim()}`)
    .join(", ")} ${match[2] ? "RESTART IDENTITY " : ""}CASCADE`;
}

interface CapturedGuard {
  table_name: string;
  trigger_name: string;
  definition: string;
  function_name: string;
  function_schema: string;
  function_body: string;
  language: string;
  returns_trigger: boolean;
  security_definer: boolean;
  function_config: string[] | null;
  function_arguments: number;
  trigger_type: number;
  enabled: string;
  arguments: number;
  condition: string | null;
}

async function captureGuards(manager: EntityManager): Promise<CapturedGuard[]> {
  const rows: CapturedGuard[] = await manager.query(
    `
    SELECT c.relname AS table_name, t.tgname AS trigger_name,
      pg_get_triggerdef(t.oid) AS definition, p.proname AS function_name,
      pn.nspname AS function_schema, p.prosrc AS function_body, l.lanname AS language,
      p.prorettype = 'pg_catalog.trigger'::regtype AS returns_trigger,
      p.prosecdef AS security_definer, p.proconfig AS function_config,
      p.pronargs AS function_arguments, t.tgtype AS trigger_type,
      t.tgenabled AS enabled, t.tgnargs AS arguments, t.tgqual::text AS condition
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND t.tgname = ANY($1::text[])
    ORDER BY c.relname, t.tgname`,
    [[...new Set(guards.map(guard => guard.name))]],
  );
  if (rows.length !== guards.length)
    throw new Error(
      "Fixture reset requires all owned projection TRUNCATE guards",
    );
  for (const row of rows) {
    const expected = guards.find(
      guard =>
        guard.table === row.table_name && guard.name === row.trigger_name,
    );
    if (
      !expected ||
      row.function_schema !== "public" ||
      row.function_name !== expected.functionName ||
      row.function_body.trim().replace(/\s+/g, " ") !== expected.body ||
      row.language !== "plpgsql" ||
      !row.returns_trigger ||
      row.security_definer ||
      row.function_config !== null ||
      row.function_arguments !== 0 ||
      row.trigger_type !== 34 ||
      row.enabled !== "O" ||
      row.arguments !== 0 ||
      row.condition !== null
    ) {
      throw new Error(
        "Fixture reset refuses an unknown or modified projection TRUNCATE guard",
      );
    }
  }
  return rows;
}

/**
 * Test-only reset, excluded from runtime/operator builds. Requires migrations
 * 268 and 270 and an explicitly configured local isolated database. DDL and
 * data reset share one checked-out transaction: failures restore every guard.
 * Unknown guards remain active and may deliberately reject the reset.
 */
export async function resetPostgresFixture(
  postgres: PostgresService,
  sql: string,
): Promise<void> {
  const expected = assertFixtureEnvironment();
  const statement = fixtureTruncate(sql);
  const options = postgres.getDataSource().options;
  if (
    options.type !== "postgres" ||
    !options.url ||
    new URL(options.url).href !== expected.href ||
    options.replication ||
    options.host ||
    options.database ||
    options.username
  ) {
    throw new Error(
      "Fixture reset service configuration does not match DATABASE_TEST_URL",
    );
  }
  await postgres.transaction(async manager => {
    const [identity] =
      await manager.query(`SELECT current_database() AS database,
      current_user, session_user, host(inet_client_addr()) AS client_address,
      host(inet_server_addr()) AS server_address`);
    assertFixtureConnection(expected, identity);
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('test-only-postgres-fixture-reset', 0))",
    );
    // Lock the exact guarded relations before inspecting definitions, preventing
    // concurrent DDL from changing a guard between capture and restoration.
    await manager.query(
      `LOCK TABLE ${guards.map(guard => `public.${guard.table}`).join(", ")} IN ACCESS EXCLUSIVE MODE`,
    );
    const captured = await captureGuards(manager);
    for (const guard of captured) {
      await manager.query(
        `DROP TRIGGER "${guard.trigger_name}" ON public."${guard.table_name}"`,
      );
    }
    await manager.query(statement);
    const [github] = await manager.query(
      "SELECT to_regclass('public.github_anchor_projection_receipts') IS NOT NULL AS installed",
    );
    // Referencing receipt tables must participate in the same TRUNCATE even
    // when empty. Keep this optional dependency explicit, never broad CASCADE.
    await manager.query(`TRUNCATE TABLE public.search_projection_transactions,
      public.search_projection_events, public.search_projection_sources,
      public.search_projection_publications, public.job_import_projection_publications,
      public.search_projection_commit_jobs, public.search_projection_commit_visibility${
        github.installed ? ", public.github_anchor_projection_receipts" : ""
      }`);
    if (/\bpublic\.(?:graph_nodes|jobpost_import_runs)\b/.test(statement)) {
      // Production retains deleted-run identities deliberately. Isolated fixture
      // graph/run resets instead start with no previously published import.
      await manager.query(`TRUNCATE TABLE public.job_latest_import_batches,
        public.job_latest_import_memberships`);
    }
    if (/\bpublic\.graph_nodes\b/.test(statement)) {
      const [market] = await manager.query(
        "SELECT to_regclass('public.job_market_source_requests') IS NOT NULL AS installed",
      );
      if (market.installed) {
        await manager.query("TRUNCATE TABLE public.job_market_source_requests");
      }
      const [report] = await manager.query(
        "SELECT to_regclass('public.developer_report_publication') IS NOT NULL AS installed",
      );
      if (report.installed) {
        // Fixture-only: a new graph cannot retain an earlier report generation.
        await manager.query(
          "UPDATE public.developer_report_publication SET attempt=NULL",
        );
        await manager.query("DELETE FROM public.developer_report_generations");
        await manager.query(
          "UPDATE public.developer_report_security_state SET epoch=0",
        );
      }
    }
    for (const guard of captured) await manager.query(guard.definition);
    const restored = await captureGuards(manager);
    if (
      restored.some(
        (guard, index) => guard.definition !== captured[index].definition,
      )
    ) {
      throw new Error(
        "Fixture reset did not restore the exact projection TRUNCATE guards",
      );
    }
  });
}
