import { Client } from "pg";
import { ProfileRepository } from "./profile.repository";
import { TelemetryRepository } from "./telemetry.repository";
import { SearchDocumentRepository } from "./search-document.repository";
import { PostgresService } from "./postgres.service";

// Employer presentation is independent of activity counts; execute the real
// repository SQL against a small, isolated activity fixture.
jest.mock("./sql/job-employer-payload.sql", () => ({
  jobEmployerJoins: (): string => "",
  jobEmployerPayload: (payload: string): string => payload,
}));

const databaseUrl = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("job activity reporting in PostgreSQL", () => {
  let db: Client;
  let telemetry: TelemetryRepository;
  let jobs: SearchDocumentRepository;
  let profiles: ProfileRepository;
  let monthStart: number;
  let currentMonth: string;
  const schema = `job_activity_test_${process.pid}`;
  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname))
      throw new Error("Activity fixtures require an isolated local database");
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
    await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},public;
      SET TIME ZONE 'Pacific/Honolulu';
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY,label text,properties jsonb);
      CREATE TABLE graph_relationships(id bigint GENERATED ALWAYS AS IDENTITY,
        source_id bigint,target_id bigint,type text,relationship_key text DEFAULT '',
        properties jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),
        UNIQUE(source_id,target_id,type,relationship_key));
      CREATE TABLE user_activity_events(id bigint GENERATED ALWAYS AS IDENTITY,
        user_node_id bigint,job_node_id bigint,event_type text,event_key text,
        occurred_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),
        surface text,position integer,dwell_ms integer,query text,filters jsonb,metadata jsonb,
        UNIQUE(user_node_id,event_key));
      CREATE TABLE job_search_documents(job_node_id bigint,short_uuid text,
        organization_id text,project_id text,managed_ecosystems text[],
        online boolean DEFAULT true,blocked boolean DEFAULT false,
        featured boolean DEFAULT false,access text DEFAULT 'public',
        legacy_list_eligible boolean DEFAULT true,tags text[] DEFAULT '{engineering}',
        published_timestamp bigint,payload jsonb DEFAULT '{}');
      CREATE TABLE organization_search_documents(organization_id text,payload jsonb);
    `);
    const executor = {
      query: async (
        sql: string,
        args: unknown[],
      ): Promise<Record<string, unknown>[]> => (await db.query(sql, args)).rows,
    };
    const postgres = {
      ...executor,
      transaction: async (
        work: (manager: typeof executor) => Promise<unknown>,
      ) => work(executor),
    } as unknown as PostgresService;
    telemetry = new TelemetryRepository(postgres);
    jobs = new SearchDocumentRepository(postgres);
    profiles = new ProfileRepository(postgres);
  });
  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  });
  beforeEach(async () => {
    await db.query("BEGIN");
    const {
      rows: [clock],
    } = await db.query(`SELECT
      extract(epoch FROM (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) * 1000 AS start,
      to_char(now() AT TIME ZONE 'UTC','Mon YYYY') AS month`);
    monthStart = Number(clock.start);
    currentMonth = clock.month;
    await db.query(`
      INSERT INTO graph_nodes VALUES (1,'User','{"wallet":"activity-user"}');
      INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,managed_ecosystems,published_timestamp,payload) VALUES
        (10,'old-job','org-1','{eco-1}',1000,'{"shortUUID":"old-job","views":0,"applications":0}'),
        (11,'undated-job','org-1','{eco-1}',NULL,'{"shortUUID":"undated-job"}'),
        (12,'other-job','org-2','{eco-2}',1000,'{"shortUUID":"other-job"}');
      INSERT INTO graph_relationships(source_id,target_id,type,properties) VALUES
        (1,10,'APPLIED_TO','{}'),(1,10,'VIEWED_DETAILS','{}');
    `);
    await db.query(
      `INSERT INTO user_activity_events(user_node_id,job_node_id,event_type,event_key,occurred_at) VALUES
      (1,10,'job_view','old-view',to_timestamp($1 / 1000.0) - interval '1 second'),
      (1,10,'job_view','view-1',to_timestamp($1 / 1000.0)),
      (1,10,'job_view','view-2',now()),
      (1,10,'job_apply','old-apply',to_timestamp($1 / 1000.0) - interval '1 second'),
      (1,10,'job_apply','apply-1',now()),
      (1,11,'job_view','undated-view',now()),
      (1,11,'job_impression','impression',now()),
      (1,12,'job_view','other-view',now()),
      (1,12,'job_apply','other-apply',now()),
      (1,12,'job_apply','future-apply',now() + interval '2 months')`,
      [monthStart],
    );
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("groups by the UTC activity month, including old and undated jobs and repeat views", async () => {
    const series = await telemetry.getDashboardJobPerformance({
      type: "organization",
      id: "org-1",
    });
    expect(series).toHaveLength(13);
    expect(series.at(-1)).toEqual({
      month: currentMonth,
      applications: 1,
      views: 3,
      conversionRate: 33.33,
    });
    expect(series.at(-2)).toMatchObject({ applications: 1, views: 1 });
    expect(
      series.slice(0, -2).every(p => p.applications === 0 && p.views === 0),
    ).toBe(true);
  });
  it("preserves organization, ecosystem and universe scopes and excludes future events", async () => {
    const organization = await telemetry.getDashboardJobPerformance({
      type: "organization",
      id: "org-1",
    });
    expect(
      await telemetry.getDashboardJobPerformance({
        type: "ecosystem",
        id: "eco-1",
      }),
    ).toEqual(organization);
    const universe = await telemetry.getDashboardJobPerformance({
      type: "ecosystem",
      id: "universe",
    });
    expect(universe.at(-1)).toMatchObject({
      applications: 2,
      views: 4,
      conversionRate: 50,
    });
    const absent = await telemetry.getDashboardJobPerformance({
      type: "organization",
      id: "absent",
    });
    expect(absent.every(p => p.applications === 0 && p.views === 0)).toBe(true);
  });
  it("uses original occurrence dates for month totals, not backfill or publication dates", async () => {
    const stats = await telemetry.getDashboardJobStats({
      type: "ecosystem",
      id: "universe",
      applicationEpochStart: monthStart,
    });
    expect(stats).toMatchObject({
      applicationsThisMonth: 2,
      totalApplications: 3,
      totalJobCount: 3,
    });
  });
  it("counts scoped repeated views within timestamp bounds", async () => {
    const input = {
      organizationId: "org-1",
      shortUuid: "old-job",
      relationshipType: "VIEWED_DETAILS" as const,
    };
    expect(await telemetry.getJobEventCount(input)).toBe(3);
    expect(
      await telemetry.getJobEventCount({ ...input, epochStart: monthStart }),
    ).toBe(2);
    expect(
      await telemetry.getJobEventCount({
        ...input,
        epochStart: monthStart,
        epochEnd: monthStart,
      }),
    ).toBe(1);
    expect(
      await telemetry.getJobEventCount({ ...input, organizationId: "org-2" }),
    ).toBe(0);
  });
  it("overrides stale projection counts in admin pages and keeps applicants distinct", async () => {
    const page = await jobs.getAdminJobPayloadPage({ page: 1, limit: 100 });
    expect(page.data.find(j => j.shortUUID === "old-job")).toMatchObject({
      applications: 1,
      views: 3,
    });
    expect(page.total).toBe(3);
    const second = await jobs.getAdminJobPayloadPage({ page: 2, limit: 1 });
    expect(second.data).toHaveLength(1);
    expect(
      (
        await jobs.getAdminJobPayloadPage({
          page: 1,
          limit: 100,
          online: false,
        })
      ).total,
    ).toBe(0);
  });
  it("reads live view counts on organization and ecosystem job lists too", async () => {
    for (const list of [
      await jobs.getOrganizationJobPayloads("org-1"),
      await jobs.getEcosystemJobPayloads(["eco-1"]),
    ]) {
      expect(list.find(j => j.shortUUID === "old-job")).toMatchObject({
        applications: 1,
        views: 3,
      });
    }
  });
  it("reflects newly recorded views immediately and does not count an event retry twice", async () => {
    for (const eventKey of ["new-view-1", "new-view-1", "new-view-2"]) {
      expect(
        await profiles.recordJobActivity("activity-user", "old-job", {
          eventType: "job_view",
          eventKey,
        }),
      ).toBe(true);
    }
    const page = await jobs.getAdminJobPayloadPage({ page: 1, limit: 100 });
    expect(page.data.find(j => j.shortUUID === "old-job")).toMatchObject({
      views: 5,
    });
    expect(
      (
        await telemetry.getDashboardJobPerformance({
          type: "organization",
          id: "org-1",
        })
      ).at(-1)?.views,
    ).toBe(5);
  });
});
