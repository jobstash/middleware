import { PostgresService } from "./postgres.service";
import { WhiteLabelBoardRepository } from "./white-label-board.repository";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("WhiteLabelBoardRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: WhiteLabelBoardRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-white-label-integration-test",
    });
    await postgres.onModuleInit();
    repository = new WhiteLabelBoardRepository(postgres);
  });

  afterAll(async () => postgres.onModuleDestroy());

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    await createNode("Organization", "owner", {
      id: "owner-id",
      orgId: "owner-org",
      name: "Owner",
      normalizedName: "owner",
    });
    await createNode("Organization", "source", {
      id: "source-id",
      orgId: "source-org",
      name: "Source",
      normalizedName: "source-org",
    });
    await createNode("OrganizationEcosystem", "ecosystem", {
      id: "ecosystem-id",
      name: "Test Ecosystem",
      normalizedName: "test-ecosystem",
      createdTimestamp: Date.now(),
    });
  });

  it("creates and retrieves an owner-scoped public board", async () => {
    const created = await repository.create("owner-org", {
      name: "Jobs",
      route: "jobs",
      domain: "jobs.example.com",
      visibility: "public" as const,
      sourceType: "organization",
      sourceSlug: "source-org",
    });
    expect(created).toMatchObject({
      status: "created",
      record: {
        sourceType: "organization",
        sourceId: "source-org",
        ownerOrganizationId: "owner-org",
      },
    });
    await expect(
      repository.find({ routeOrDomain: "jobs.example.com", publicOnly: true }),
    ).resolves.toHaveLength(1);
  });

  it("enforces route uniqueness", async () => {
    const input = {
      name: "Jobs",
      route: "jobs",
      visibility: "public" as const,
      sourceType: "organization" as const,
      sourceSlug: "source-org",
    };
    await repository.create("owner-org", input);
    await expect(repository.create("owner-org", input)).resolves.toMatchObject({
      status: "conflict",
    });
  });

  it("atomically replaces a board source", async () => {
    await repository.create("owner-org", {
      name: "Jobs",
      route: "jobs",
      visibility: "private",
      sourceType: "organization",
      sourceSlug: "source-org",
    });
    const updated = await repository.update("owner-org", "jobs", {
      name: "Ecosystem Jobs",
      route: "ecosystem-jobs",
      visibility: "public",
      sourceType: "ecosystem",
      sourceSlug: "test-ecosystem",
    });
    expect(updated).toMatchObject({
      status: "updated",
      record: { sourceType: "ecosystem", sourceId: "ecosystem-id" },
    });
    const [row] = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM graph_relationships relationship
      JOIN graph_nodes board ON board.id = relationship.source_id
      WHERE board.label = 'WhiteLabelBoard'
        AND relationship.type = 'HAS_SOURCE'
    `);
    expect(row.count).toBe("1");
  });

  it("filters ecosystem boards for non-manager views", async () => {
    await repository.create("owner-org", {
      name: "Ecosystem Jobs",
      route: "ecosystem-jobs",
      visibility: "public",
      sourceType: "ecosystem",
      sourceSlug: "test-ecosystem",
    });
    await expect(
      repository.find({
        organizationId: "owner-org",
        organizationSourcesOnly: true,
      }),
    ).resolves.toEqual([]);
  });

  it("prevents cross-owner updates and deletes", async () => {
    await repository.create("owner-org", {
      name: "Jobs",
      route: "jobs",
      visibility: "private",
      sourceType: "organization",
      sourceSlug: "source-org",
    });
    await expect(
      repository.update("source-org", "jobs", {
        name: "Hijacked",
        route: "hijacked",
        visibility: "public",
        sourceType: "organization",
        sourceSlug: "source-org",
      }),
    ).resolves.toMatchObject({ status: "not_found" });
    await expect(repository.delete("source-org", "jobs")).resolves.toBe(false);
    await expect(repository.delete("owner-org", "jobs")).resolves.toBe(true);
  });

  async function createNode(
    label: string,
    key: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
      `,
      [label, key, JSON.stringify(properties)],
    );
  }
});
