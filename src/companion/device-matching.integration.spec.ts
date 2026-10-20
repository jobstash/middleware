import { Client } from "pg";
import { matchingCatalogue, matchingJobs } from "./device-matching";
import { MatchingCatalogueArgs } from "./device-execution.protocol";

const databaseUrl = process.env.COMPANION_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const until = "2026-10-20T00:00:00.000Z";
const day = 86400000;
const end = Date.parse(until);
const args = (since: string | null, publicationRange: MatchingCatalogueArgs["publicationRange"] = "all"): MatchingCatalogueArgs => ({ publicationRange, since, until });

describeDatabase("companion catalogue executed in isolated PostgreSQL", () => {
  let client: Client;
  const schema = `companion_catalogue_test_${process.pid}`;
  const db = {
    query: async <T extends Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<T[]> =>
      (await client.query(sql, parameters)).rows as T[],
  };
  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) ||
      !decodeURIComponent(target.pathname).includes("test")) {
      throw new Error("Companion fixtures require an isolated local test database");
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE job_search_documents (job_node_id bigint PRIMARY KEY, title text DEFAULT 'Engineer',
        organization_id text, organization_name text, project_id text, online boolean DEFAULT true,
        blocked boolean DEFAULT false, published_timestamp bigint, payload jsonb DEFAULT '{}', detail_payload jsonb DEFAULT '{}');
      CREATE TABLE organization_search_documents (organization_id text PRIMARY KEY, payload jsonb, project_ids text[]);
      CREATE TABLE project_search_documents (project_id text PRIMARY KEY, payload jsonb);
      CREATE TABLE graph_nodes (id bigint PRIMARY KEY, label text, properties jsonb);
      CREATE TABLE graph_relationships (source_id bigint, target_id bigint, type text);`);
  });
  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
    }
  });
  beforeEach(async () => { await client.query("BEGIN"); });
  afterEach(async () => { await client.query("ROLLBACK"); });

  it.each([
    ["today", 1], ["yesterday", 2], ["past_3_days", 3], ["past_week", 7],
    ["past_2_weeks", 14], ["past_month", 30], ["all", null],
  ] as const)("counts and pages the exact %s bounds", async (range, days) => {
    // Include exact lower/upper boundaries, old/null timestamps and excluded statuses.
    await client.query(`INSERT INTO job_search_documents(job_node_id,published_timestamp)
      SELECT n+1,$1::bigint-n*$2::bigint FROM generate_series(0,40) n`, [end, day]);
    await client.query(`INSERT INTO job_search_documents(job_node_id,published_timestamp) VALUES (90,NULL)`);
    await client.query(`INSERT INTO job_search_documents(job_node_id,published_timestamp,online,blocked)
      VALUES (91,$1,false,false),(92,$1,true,true)`, [end-day]);
    const since = days === null ? null : new Date(end-days*day).toISOString();
    // Yesterday is a previous-day window, not a rolling two-day window.
    const request = { ...args(since, range), until: range === "yesterday" ? new Date(end-day).toISOString() : until };
    const expected = range === "yesterday" ? 1 : days ?? 40;
    const count = await matchingCatalogue(db, { ...request, countOnly: true });
    expect(count).toEqual({ total: expected, jobs: [], nextOffset: null,
      publicationWindow: { range, since, until: request.until } });
    const page = await matchingCatalogue(db, request);
    expect(page.total).toBe(expected);
    expect(page.jobs).toHaveLength(expected);
    expect(page.nextOffset).toBeNull();
    expect(page.jobs[0].publishedAt).toBe(new Date(Date.parse(request.until)-day).toISOString());
    expect(page.jobs[page.jobs.length - 1].publishedAt).toBe(new Date(end-(days ?? 40)*day).toISOString());
  });

  it("exhausts 100001 jobs in stable canonical-ID pages without a total cap", async () => {
    await client.query(`INSERT INTO job_search_documents(job_node_id,published_timestamp)
      SELECT n,$1 FROM generate_series(1,100001) n`, [end-day]);
    const request = args(null);
    expect((await matchingCatalogue(db, { ...request, countOnly: true })).total).toBe(100001);
    const expected = (await client.query(`SELECT 'node:' || job_node_id::text AS id FROM job_search_documents
      ORDER BY published_timestamp DESC,('node:' || job_node_id::text) COLLATE "C"`)).rows.map(row => row.id);
    const ids: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page = await matchingCatalogue(db, { ...request, offset });
      expect(page.total).toBe(100001);
      expect(page.jobs.length).toBeLessThanOrEqual(1000);
      ids.push(...page.jobs.map(job => job.id));
      offset = page.nextOffset;
    }
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(100001);
    expect(await matchingCatalogue(db, { ...request, offset: 100001 })).toEqual({
      total: 100001, jobs: [], nextOffset: null, publicationWindow: { range: "all", since: null, until },
    });
  }, 120000);

  it("returns the exact empty scope and count for offsets beyond the last page", async () => {
    const request = args(new Date(end-day).toISOString(), "today");
    expect(await matchingCatalogue(db, { ...request, offset: Number.MAX_SAFE_INTEGER })).toEqual({
      total: 0, jobs: [], nextOffset: null,
      publicationWindow: { range: "today", since: request.since, until },
    });
    expect(await matchingCatalogue(db, { ...request, countOnly: true })).toEqual({
      total: 0, jobs: [], nextOffset: null,
      publicationWindow: { range: "today", since: request.since, until },
    });
  });

  it("keeps older originals and current salary, role-city, work-mode and card-term projections", async () => {
    await client.query(`INSERT INTO organization_search_documents VALUES ('org','{"name":"Org","location":"Employer HQ"}', '{}');
      INSERT INTO graph_nodes VALUES (10,'Jobpost','{"content":"Full older original advertisement","location":"France only"}');
      INSERT INTO graph_relationships VALUES (10,1,'HAS_STRUCTURED_JOBPOST');`);
    await client.query(`INSERT INTO job_search_documents(job_node_id,organization_id,published_timestamp,payload,detail_payload)
      VALUES (1,'org',$1,'{"extractedMinimumSalary":90,"extractedMaximumSalary":70,"salaryCurrency":"EUR","payRate":"HOURLY","url":"https://example.test/apply","seniority":"3","commitment":"FULL_TIME","classification":"SMART_CONTRACTS"}',
        '{"minimumSalary":200000,"availability":[{"placeKind":"city","placeName":"Paris","workMode":"hybrid"}]}'),
      (2,'org',$2,'{"seniority":" ","title":"Bare"}','{}')`, [end-100*day, end-101*day]);
    const page = await matchingCatalogue(db, args(null));
    expect(page.jobs[0]).toMatchObject({ id: "node:1", company: "Org", city: "Paris", location: "France only",
      workMode: "hybrid", salary: { minimum: 70, maximum: 90, stated: null, currency: "EUR", period: "hour" },
      applyUrl: "https://example.test/apply", seniority: "3", commitment: "FULL_TIME", classification: "SMART_CONTRACTS" });
    expect(page.jobs[1]).toMatchObject({ id: "node:2", seniority: null, commitment: null, classification: null });
    expect((await matchingCatalogue(db, args(new Date(end-14*day).toISOString(), "past_2_weeks"))).total).toBe(0);
    const details = await matchingJobs(db, ["node:1", "node:2"]);
    expect(details.jobs[0]).toMatchObject({ ad: "Full older original advertisement", city: "Paris", location: "France only", workMode: "hybrid",
      seniority: "3", commitment: "FULL_TIME", classification: "SMART_CONTRACTS" });
    expect(details.jobs[0].locationEvidence).toContain("Raw advertised role location: France only");
    expect(details.jobs[1]).toMatchObject({ id: "node:2", seniority: null, commitment: null, classification: null });
  });
});
