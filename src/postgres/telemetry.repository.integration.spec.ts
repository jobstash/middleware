import { TelemetryRepository } from "./telemetry.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("TelemetryRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: TelemetryRepository;
  let userNodeId: string;
  let secondUserNodeId: string;
  let activeJobNodeId: string;
  let inactiveJobNodeId: string;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-telemetry-integration-test",
    });
    await postgres.onModuleInit();
    repository = new TelemetryRepository(postgres);
  });

  afterAll(async () => postgres.onModuleDestroy());

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    const organizationNodeId = await createNode("Organization", "org", {
      id: "org-id",
      orgId: "org-1",
      name: "Acme",
    });
    userNodeId = await createNode("User", "user-1", {
      id: "user-1",
      wallet: "0xabc",
      privyId: "privy-1",
      available: true,
      createdTimestamp: Date.now(),
    });
    secondUserNodeId = await createNode("User", "user-2", {
      id: "user-2",
      wallet: "0xdef",
      available: true,
      createdTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    activeJobNodeId = await createNode("StructuredJobpost", "job-active", {
      id: "job-active",
      shortUUID: "active-short",
    });
    inactiveJobNodeId = await createNode("StructuredJobpost", "job-inactive", {
      id: "job-inactive",
      shortUUID: "inactive-short",
    });

    await postgres.query(
      `
        INSERT INTO organization_search_documents (
          organization_node_id, organization_id, name, normalized_name,
          ecosystems, payload, detail_payload
        ) VALUES (
          $1, 'org-1', 'Acme', 'acme', ARRAY['test-ecosystem'],
          '{"orgId":"org-1","name":"Acme"}',
          '{"orgId":"org-1","name":"Acme"}'
        )
      `,
      [organizationNodeId],
    );
    const previousMonth = new Date();
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          title, access, online, featured, published_timestamp, ecosystems,
          managed_ecosystems, payload, detail_payload
        ) VALUES
        (
          $1, 'job-active', 'active-short', 'org-1', 'Engineer', 'protected',
          true, true, $3, ARRAY['test-ecosystem'], ARRAY['test-ecosystem'],
          '{"id":"job-active","classification":"Engineering"}',
          '{"id":"job-active","classification":"Engineering"}'
        ),
        (
          $2, 'job-inactive', 'inactive-short', 'org-1', 'Designer', 'public',
          false, false, $3, ARRAY['test-ecosystem'], ARRAY['test-ecosystem'],
          '{"id":"job-inactive","classification":"Design"}',
          '{"id":"job-inactive","classification":"Design"}'
        )
      `,
      [activeJobNodeId, inactiveJobNodeId, previousMonth.getTime()],
    );
    await createRelationship(userNodeId, activeJobNodeId, "APPLIED_TO", {
      createdTimestamp: Date.now(),
    });
    await createRelationship(secondUserNodeId, activeJobNodeId, "APPLIED_TO", {
      createdTimestamp: Date.now() - 60 * 24 * 60 * 60 * 1000,
    });
    await createRelationship(userNodeId, activeJobNodeId, "VIEWED_DETAILS", {
      createdTimestamp: Date.now(),
    });
  });

  it("upserts one login-history node per user", async () => {
    await repository.logUserLoginEvent("privy-1");
    await repository.logUserLoginEvent("0xabc");
    const [row] = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM graph_relationships
      WHERE source_id = ${userNodeId}
        AND type = 'LOGGED_IN'
    `);
    expect(row.count).toBe("1");
  });

  it("counts scoped job views and applications by indexed relationships", async () => {
    await expect(
      repository.getJobEventCount({
        organizationId: "org-1",
        shortUuid: "active-short",
        relationshipType: "VIEWED_DETAILS",
      }),
    ).resolves.toBe(1);
    await expect(
      repository.getJobEventCount({
        organizationId: "org-1",
        relationshipType: "APPLIED_TO",
        epochStart: Date.now() - 24 * 60 * 60 * 1000,
      }),
    ).resolves.toBe(1);
  });

  it("aggregates organization and ecosystem dashboard job stats", async () => {
    const organization = await repository.getDashboardJobStats({
      type: "organization",
      id: "org-1",
      applicationEpochStart: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    expect(organization).toEqual({
      jobCounts: { active: 1, inactive: 1, expert: 1, promoted: 1 },
      applicationsThisMonth: 1,
      totalApplications: 2,
      totalJobCount: 2,
    });
    await expect(
      repository.getDashboardJobStats({
        type: "ecosystem",
        id: "test-ecosystem",
        applicationEpochStart: 0,
      }),
    ).resolves.toMatchObject({ totalJobCount: 2, totalApplications: 2 });
  });

  it("returns a 13-month PostgreSQL-generated job series", async () => {
    const [series] = await repository.getDashboardJobStatsSeries({
      type: "organization",
      id: "org-1",
    });
    expect(series.organization).toBe("Acme");
    expect(series.stats).toHaveLength(13);
    expect(series.stats.reduce((sum, point) => sum + point.count, 0)).toBe(2);
  });

  it("aggregates available talent and ranked application categories", async () => {
    const stats = await repository.getDashboardTalentStats(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
      10,
    );
    expect(stats).toMatchObject({
      totalAvailableTalent: 2,
      newTalentThisWeek: 1,
      topJobCategories: [{ label: "Engineering", count: 2 }],
    });
    expect(stats.recentApplication).toBeGreaterThan(0);
  });

  async function createNode(
    label: string,
    key: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS id
      `,
      [label, key, JSON.stringify(properties)],
    );
    return row.id;
  }

  async function createRelationship(
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', $4::jsonb)
      `,
      [sourceNodeId, targetNodeId, type, JSON.stringify(properties)],
    );
  }
});
