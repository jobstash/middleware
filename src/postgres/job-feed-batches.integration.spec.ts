import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PostgresService } from "./postgres.service";
import { SearchDocumentRepository } from "./search-document.repository";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

// Temporary tables on one connection exercise the real feed SQL without
// truncating a shared local database or depending on unrelated projections.
describePostgres("latest import organization feed", () => {
  let client: Client;
  let repository: SearchDocumentRepository;
  let sequence: number;
  let lastQuery: { sql: string; parameters: unknown[] };

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
    });
    await client.connect();
    repository = new SearchDocumentRepository({
      query: async (sql: string, parameters: unknown[]) => {
        lastQuery = { sql, parameters };
        return (await client.query(sql, parameters)).rows;
      },
    } as unknown as PostgresService);
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    sequence = 0;
    await client.query(`
      BEGIN;
      CREATE TEMP TABLE jobpost_import_runs (
        id uuid PRIMARY KEY, source_key text, status text, completed_at timestamptz
      ) ON COMMIT DROP;
      CREATE TEMP TABLE jobpost_import_run_items (
        run_id uuid, jobsite_id text, employer_id text, employer_label text,
        organization_id text, status text, item_kind text DEFAULT 'jobsite',
        stable_external_id text, input_payload jsonb DEFAULT '{}',
        PRIMARY KEY (run_id, jobsite_id)
      ) ON COMMIT DROP;
      CREATE TEMP TABLE jobpost_import_run_discoveries (
        run_id uuid, jobsite_id text, discovery_key text,
        PRIMARY KEY (run_id, jobsite_id, discovery_key)
      ) ON COMMIT DROP;
      CREATE TEMP TABLE graph_nodes (
        id bigint PRIMARY KEY, label text, properties jsonb
      ) ON COMMIT DROP;
      CREATE TEMP TABLE graph_relationships (
        source_id bigint, target_id bigint, type text
      ) ON COMMIT DROP;
      CREATE TEMP TABLE organization_search_documents (
        organization_id text PRIMARY KEY, payload jsonb
      ) ON COMMIT DROP;
      CREATE TEMP TABLE project_search_documents (
        project_id text PRIMARY KEY, payload jsonb
      ) ON COMMIT DROP;
      CREATE TEMP TABLE job_search_documents (
        job_node_id bigint PRIMARY KEY, structured_jobpost_id text,
        short_uuid text, title text, location text, organization_id text,
        project_id text, jobsite_id text, published_timestamp bigint,
        online boolean DEFAULT true, blocked boolean DEFAULT false,
        legacy_list_eligible boolean DEFAULT true,
        access text DEFAULT 'public', organization_has_expert_jobs boolean DEFAULT false,
        tags text[] DEFAULT ARRAY['engineering']::text[],
        salary numeric DEFAULT 100000, salary_currency text DEFAULT 'USD', seniority text,
        payload jsonb DEFAULT '{}', work_arrangement jsonb DEFAULT '{}'
      ) ON COMMIT DROP;
      CREATE INDEX ON jobpost_import_run_items (run_id, item_kind, stable_external_id);
      CREATE INDEX ON graph_nodes ((properties ->> 'id'));
      CREATE INDEX ON graph_relationships (source_id, type, target_id);
      CREATE INDEX ON graph_relationships (target_id, type, source_id);
    `);
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  async function addRun(
    organizationId: string,
    completedAt: string,
    sites: Record<string, string> = { main: "succeeded" },
    status = "completed",
  ): Promise<string> {
    const runId = randomUUID();
    await client.query(
      "INSERT INTO jobpost_import_runs VALUES ($1, 'jobposts', $2, $3)",
      [runId, status, completedAt],
    );
    await client.query(
      "INSERT INTO organization_search_documents VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [organizationId, { orgId: organizationId, name: organizationId }],
    );
    for (const [site, itemStatus] of Object.entries(sites)) {
      await client.query(
        "INSERT INTO jobpost_import_run_items (run_id, jobsite_id, employer_id, employer_label, organization_id, status) VALUES ($1, $2, $3, 'Organization', $3, $4)",
        [runId, site, organizationId, itemStatus],
      );
    }
    return runId;
  }

  async function addJob(input: {
    organizationId: string;
    runId?: string;
    site?: string;
    title?: string;
    timestamp?: number;
    salary?: number;
    online?: boolean;
    url?: string;
  }): Promise<string> {
    const id = ++sequence;
    const publicId = `job-${id}`;
    const site = input.site ?? "main";
    const url = input.url ?? `https://fixture.invalid/jobs/${id}`;
    await client.query(
      `INSERT INTO graph_nodes VALUES ($1, 'Jobpost', $2);
      `,
      [id * 2, { url }],
    );
    await client.query(
      "INSERT INTO graph_relationships VALUES ($1, $2, 'HAS_STRUCTURED_JOBPOST')",
      [id * 2, id * 2 + 1],
    );
    await client.query(
      `INSERT INTO job_search_documents (
        job_node_id, structured_jobpost_id, short_uuid, title, location,
        organization_id, jobsite_id, published_timestamp, salary, online, payload
      ) VALUES ($1, $2, $2, $3, 'Amsterdam', $4, $5, $6, $7, $8, $9)`,
      [
        id * 2 + 1,
        publicId,
        input.title ?? "Software Engineer",
        input.organizationId,
        site,
        input.timestamp ?? id,
        input.salary ?? 100000,
        input.online ?? true,
        {
          id: publicId,
          shortUUID: publicId,
          title: input.title ?? "Software Engineer",
        },
      ],
    );
    if (input.runId) {
      await client.query(
        "INSERT INTO jobpost_import_run_discoveries VALUES ($1, $2, $3)",
        [input.runId, site, url],
      );
    }
    return publicId;
  }

  async function addHirechainRun(
    organizationId: string,
    completedAt: string,
    jobs: string[],
    previous: string[],
    failed: string[] = [],
  ): Promise<string> {
    const runId = await addRun(organizationId, completedAt);
    await client.query(
      "UPDATE jobpost_import_runs SET source_key = 'hirechain' WHERE id = $1",
      [runId],
    );
    await client.query(
      "DELETE FROM jobpost_import_run_items WHERE run_id = $1",
      [runId],
    );
    const url = (id: string): string =>
      `https://fixture.invalid/jobs/${id.replace("job-", "")}`;
    await client.query(`
      INSERT INTO graph_nodes VALUES (900000, 'Jobsite', '{"id":"hirechain", "type":"hirechain"}')
      ON CONFLICT DO NOTHING
    `);
    await client.query(
      "INSERT INTO graph_nodes VALUES (900001, 'Organization', $1) ON CONFLICT DO NOTHING",
      [{ orgId: organizationId }],
    );
    await client.query(
      "INSERT INTO graph_relationships VALUES (900001, 900000, 'HAS_JOBSITE')",
    );
    for (const id of jobs) {
      await client.query(
        "INSERT INTO graph_relationships VALUES (900000, $1, 'HAS_JOBPOST')",
        [Number(id.replace("job-", "")) * 2],
      );
    }
    await client.query(
      `
      INSERT INTO jobpost_import_run_items (run_id, jobsite_id, status, item_kind, input_payload)
      VALUES ($1, 'finalize', 'succeeded', 'hirechain_finalize', $2)
    `,
      [
        runId,
        {
          previouslyStructuredUrls: previous.map(url),
          onlineUrls: jobs.map(url),
        },
      ],
    );
    for (const id of jobs) {
      await client.query(
        `
        INSERT INTO jobpost_import_run_items (run_id, jobsite_id, status, item_kind, stable_external_id)
        VALUES ($1, $2, $3, 'hirechain_job', $4)
      `,
        [runId, id, failed.includes(id) ? "failed" : "succeeded", url(id)],
      );
    }
    return runId;
  }

  it("uses Hirechain's saved admission snapshot and compares its completed run with jobsite runs", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    await addJob({ organizationId: "acme", runId: oldRun });
    const previous = await addJob({
      organizationId: "acme",
      site: "hirechain",
    });
    const fresh = await addJob({ organizationId: "acme", site: "hirechain" });
    const hirechainRun = await addHirechainRun(
      "acme",
      "2026-01-02",
      [previous, fresh],
      [previous],
    );
    const result = await repository.searchLatestImportJobGroups({});
    expect(result.totalJobs).toBe(1);
    expect(result.data[0].importRunId).toBe(hirechainRun);
    expect(result.data[0].jobTitles.map(job => job.id)).toEqual([fresh]);
    await addRun("acme", "2026-01-03");
    expect((await repository.searchLatestImportJobGroups({})).data).toEqual([]);
  });

  it("does not revive a prior batch after Hirechain imports no new jobs for the organization", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    await addJob({ organizationId: "acme", runId: oldRun });
    const previous = await addJob({
      organizationId: "acme",
      site: "hirechain",
    });
    await addHirechainRun("acme", "2026-01-02", [previous], [previous]);
    expect((await repository.searchLatestImportJobGroups({})).data).toEqual([]);
  });

  it("retains the earlier complete batch if Hirechain failed an organization item", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    const oldJob = await addJob({ organizationId: "acme", runId: oldRun });
    const failed = await addJob({ organizationId: "acme", site: "hirechain" });
    const fresh = await addJob({ organizationId: "acme", site: "hirechain" });
    const runId = await addHirechainRun(
      "acme",
      "2026-01-02",
      [failed, fresh],
      [],
      [failed],
    );
    await client.query(
      "UPDATE jobpost_import_runs SET status = 'completed_with_errors' WHERE id = $1",
      [runId],
    );
    await client.query(
      "DELETE FROM job_search_documents WHERE structured_jobpost_id = $1",
      [failed],
    );
    expect(
      (await repository.searchLatestImportJobGroups({})).data[0].jobTitles.map(
        job => job.id,
      ),
    ).toEqual([oldJob]);
  });

  it("does not invent Hirechain membership when an older run lacks its admission snapshot", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    const oldJob = await addJob({ organizationId: "acme", runId: oldRun });
    const fresh = await addJob({ organizationId: "acme", site: "hirechain" });
    const runId = await addHirechainRun("acme", "2026-01-02", [fresh], []);
    await client.query(
      "UPDATE jobpost_import_run_items SET input_payload = '{}' WHERE run_id = $1 AND item_kind = 'hirechain_finalize'",
      [runId],
    );
    expect(
      (await repository.searchLatestImportJobGroups({})).data[0].jobTitles.map(
        job => job.id,
      ),
    ).toEqual([oldJob]);
  });

  it("returns all 63 titles but only the first full card and orders organizations before pagination", async () => {
    const acmeRun = await addRun("acme", "2026-01-01");
    const betaRun = await addRun("beta", "2026-01-02");
    const ids: string[] = [];
    for (let i = 0; i < 63; i++) {
      ids.push(
        await addJob({
          organizationId: "acme",
          runId: acmeRun,
          timestamp: 1000 + i,
        }),
      );
    }
    const betaJob = await addJob({
      organizationId: "beta",
      runId: betaRun,
      timestamp: 2000,
    });
    const first = await repository.searchLatestImportJobGroups({
      page: 1,
      limit: 1,
    });
    const second = await repository.searchLatestImportJobGroups({
      page: 2,
      limit: 1,
    });
    expect(first).toMatchObject({ total: 2, totalJobs: 64, count: 1 });
    expect(first.data[0]).toMatchObject({
      organizationId: "beta",
      importRunId: betaRun,
      totalJobs: 1,
    });
    expect(first.data[0].jobs[0].id).toBe(betaJob);
    expect(second.data[0]).toMatchObject({
      organizationId: "acme",
      importRunId: acmeRun,
      totalJobs: 63,
    });
    expect(second.data[0].jobTitles.map(job => job.id)).toEqual(ids.reverse());
    expect(second.data[0].jobTitles[0]).toMatchObject({
      title: "Software Engineer",
      location: "Amsterdam",
    });
    expect(second.data[0].jobs.map(job => job.id)).toEqual([ids[0]]);
    expect(
      (await repository.searchLatestImportJobGroups({ page: 3, limit: 1 }))
        .data,
    ).toEqual([]);
    expect(
      (await repository.searchLatestImportJobGroups({ page: 2, limit: 1 }))
        .data,
    ).toEqual(second.data);
  });

  it("uses stable organization and job ordering when publication timestamps match", async () => {
    const betaRun = await addRun("beta", "2026-01-01");
    await addJob({ organizationId: "beta", runId: betaRun, timestamp: 5000 });
    const acmeRun = await addRun("acme", "2026-01-01");
    const firstId = await addJob({
      organizationId: "acme",
      runId: acmeRun,
      timestamp: 5000,
    });
    const secondId = await addJob({
      organizationId: "acme",
      runId: acmeRun,
      timestamp: 5000,
    });
    const firstPage = await repository.searchLatestImportJobGroups({
      page: 1,
      limit: 1,
    });
    const secondPage = await repository.searchLatestImportJobGroups({
      page: 2,
      limit: 1,
    });
    expect(firstPage.data[0].organizationId).toBe("acme");
    expect(firstPage.data[0].jobTitles.map(job => job.id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(secondPage.data[0].organizationId).toBe("beta");
  });

  it("combines jobsites and deduplicates repeated raw references to the same job", async () => {
    const runId = await addRun("acme", "2026-01-01", {
      careers: "succeeded",
      engineering: "succeeded",
    });
    const first = await addJob({
      organizationId: "acme",
      runId,
      site: "careers",
    });
    const second = await addJob({
      organizationId: "acme",
      runId,
      site: "engineering",
    });
    await client.query(
      "INSERT INTO graph_nodes VALUES (1000, 'Jobpost', '{\"url\":\"https://fixture.invalid/jobs/1\"}')",
    );
    await client.query(
      "INSERT INTO graph_relationships VALUES (1000, 3, 'HAS_STRUCTURED_JOBPOST')",
    );
    const result = await repository.searchLatestImportJobGroups({});
    expect(result.totalJobs).toBe(2);
    expect(result.data[0].jobTitles.map(job => job.id)).toEqual([
      second,
      first,
    ]);
  });

  it("does not revive an older batch when the latest successful run found no new jobs", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    await addJob({ organizationId: "acme", runId: oldRun });
    await addRun("acme", "2026-01-02", { main: "skipped" });
    const result = await repository.searchLatestImportJobGroups({});
    expect(result).toMatchObject({ total: 0, totalJobs: 0, data: [] });
  });

  it("selects the latest batch before applying pillar filters and excludes untracked historical jobs", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    await addJob({ organizationId: "acme", runId: oldRun, salary: 200000 });
    const latestRun = await addRun("acme", "2026-01-02");
    await addJob({ organizationId: "acme", runId: latestRun, salary: 90000 });
    await addJob({ organizationId: "acme", salary: 250000 });
    const result = await repository.searchLatestImportJobGroups({
      pillarCriteria: { minSalaryRange: 150000 },
    });
    expect(result.data).toEqual([]);
    expect((await repository.searchLatestImportJobGroups({})).totalJobs).toBe(
      1,
    );
  });

  it("keeps the previous completed batch through unfinished, cancelled, or partially failed imports", async () => {
    const oldRun = await addRun("acme", "2026-01-01");
    const oldJob = await addJob({ organizationId: "acme", runId: oldRun });
    for (const status of [
      "running",
      "paused",
      "cancelled",
      "interrupted",
      "failed",
    ]) {
      const runId = await addRun(
        "acme",
        "2026-02-01",
        { main: "succeeded" },
        status,
      );
      await addJob({ organizationId: "acme", runId });
    }
    const partialRun = await addRun(
      "acme",
      "2026-03-01",
      { main: "succeeded", second: "failed" },
      "completed_with_errors",
    );
    await addJob({ organizationId: "acme", runId: partialRun });
    const result = await repository.searchLatestImportJobGroups({});
    expect(result.data[0].importRunId).toBe(oldRun);
    expect(result.data[0].jobTitles.map(job => job.id)).toEqual([oldJob]);
  });

  it("accepts an organization's complete batch when other organizations failed", async () => {
    const runId = await addRun(
      "acme",
      "2026-01-01",
      { main: "succeeded" },
      "completed_with_errors",
    );
    const id = await addJob({ organizationId: "acme", runId });
    await client.query(
      "INSERT INTO jobpost_import_run_items (run_id, jobsite_id, employer_id, employer_label, organization_id, status) VALUES ($1, 'other', 'beta', 'Organization', 'beta', 'failed')",
      [runId],
    );
    expect(
      (await repository.searchLatestImportJobGroups({})).data[0].jobTitles.map(
        job => job.id,
      ),
    ).toEqual([id]);
  });

  it("requires both the recorded employer and jobsite, and hides offline jobs", async () => {
    const runId = await addRun("acme", "2026-01-01");
    const id = await addJob({ organizationId: "acme", runId });
    await addJob({ organizationId: "acme", runId, online: false });
    await addJob({
      organizationId: "beta",
      url: "https://fixture.invalid/jobs/1",
    });
    const wrongSite = await addJob({ organizationId: "acme", runId });
    await client.query(
      "UPDATE job_search_documents SET jobsite_id = 'unrelated' WHERE structured_jobpost_id = $1",
      [wrongSite],
    );
    expect(
      (await repository.searchLatestImportJobGroups({})).data[0].jobTitles.map(
        job => job.id,
      ),
    ).toEqual([id]);
  });
  it("limits published Hirechain membership work to each organization's selected run", async () => {
    const organizationCount = 8;
    const jobsPerOrganization = 200;
    const historyCount = 40;
    await client.query(`
      INSERT INTO organization_search_documents
      SELECT 'org-' || org, jsonb_build_object('orgId', 'org-' || org, 'name', 'Company ' || org)
      FROM generate_series(1, ${organizationCount}) org;
      INSERT INTO graph_nodes
      SELECT org, 'Organization', jsonb_build_object('orgId', 'org-' || org)
      FROM generate_series(1, ${organizationCount}) org;
      INSERT INTO graph_nodes
      SELECT 100 + org, 'Jobsite', jsonb_build_object('id', 'site-' || org, 'type', 'hirechain')
      FROM generate_series(1, ${organizationCount}) org;
      INSERT INTO graph_relationships
      SELECT org, 100 + org, 'HAS_JOBSITE'
      FROM generate_series(1, ${organizationCount}) org;
      INSERT INTO graph_nodes
      SELECT 1000 + job, 'Jobpost', jsonb_build_object('url', 'https://fixture.invalid/job/' || job)
      FROM generate_series(1, ${organizationCount * jobsPerOrganization}) job;
      INSERT INTO graph_relationships
      SELECT 101 + (job - 1) / ${jobsPerOrganization}, 1000 + job, 'HAS_JOBPOST'
      FROM generate_series(1, ${organizationCount * jobsPerOrganization}) job;
      INSERT INTO graph_relationships
      SELECT 1000 + job, 10000 + job, 'HAS_STRUCTURED_JOBPOST'
      FROM generate_series(1, ${organizationCount * jobsPerOrganization}) job;
      INSERT INTO job_search_documents (
        job_node_id, structured_jobpost_id, short_uuid, title, organization_id,
        jobsite_id, published_timestamp, payload
      ) SELECT 10000 + job, 'job-' || job, 'job-' || job, 'Engineer ' || job,
        'org-' || (1 + (job - 1) / ${jobsPerOrganization}),
        'site-' || (1 + (job - 1) / ${jobsPerOrganization}), job,
        jsonb_build_object('id', 'job-' || job, 'title', 'Engineer ' || job)
      FROM generate_series(1, ${organizationCount * jobsPerOrganization}) job;
      INSERT INTO jobpost_import_runs
      SELECT md5('history-' || history)::uuid, 'hirechain', 'completed',
        '2026-01-01'::timestamptz + history * interval '1 day'
      FROM generate_series(1, ${historyCount}) history;
      INSERT INTO jobpost_import_run_items (run_id, jobsite_id, status, item_kind, stable_external_id)
      SELECT run.id, 'job-' || job, 'succeeded', 'hirechain_job', 'https://fixture.invalid/job/' || job
      FROM jobpost_import_runs run
      CROSS JOIN generate_series(1, ${organizationCount * jobsPerOrganization}) job;
      INSERT INTO jobpost_import_run_items (run_id, jobsite_id, status, item_kind, input_payload)
      SELECT run.id, 'finalizer', 'succeeded', 'hirechain_finalize', jsonb_build_object(
        'previouslyStructuredUrls', (SELECT jsonb_agg('https://fixture.invalid/job/' || job)
          FROM generate_series(1, ${organizationCount * jobsPerOrganization}) job
          WHERE job % ${jobsPerOrganization} <> 0))
      FROM jobpost_import_runs run;
      ANALYZE jobpost_import_runs;
      ANALYZE jobpost_import_run_items;
      ANALYZE graph_nodes;
      ANALYZE graph_relationships;
      ANALYZE job_search_documents;
    `);
    const result = await repository.searchLatestImportJobGroups({ limit: 3 });
    expect(result.total).toBe(organizationCount);
    expect(result.totalJobs).toBe(organizationCount);
    expect(result.data).toHaveLength(3);
    const planResult = await client.query(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${lastQuery.sql}`,
      lastQuery.parameters,
    );
    const plan = planResult.rows[0]["QUERY PLAN"][0];
    type QueryPlan = {
      "Subplan Name"?: string;
      "Actual Rows"?: number;
      Plans?: QueryPlan[];
    };
    const findPlan = (node: QueryPlan, name: string): QueryPlan | undefined => {
      if (node["Subplan Name"] === name) return node;
      for (const child of node.Plans ?? []) {
        const found = findPlan(child, name);
        if (found) return found;
      }
      return undefined;
    };
    const membership = findPlan(plan.Plan, "CTE hirechain_jobs");
    if (process.env.REPORT_JOB_FEED_PLAN === "1") {
      process.stdout.write(
        `${JSON.stringify({ retainedItems: organizationCount * jobsPerOrganization * historyCount, membershipRows: membership?.["Actual Rows"], executionMs: plan["Execution Time"], planningMs: plan["Planning Time"] })}\n`,
      );
    }
    expect(membership?.["Actual Rows"]).toBe(organizationCount);
  });
});
