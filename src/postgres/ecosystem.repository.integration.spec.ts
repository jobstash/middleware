import { EcosystemRepository } from "./ecosystem.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("EcosystemRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: EcosystemRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-ecosystem-integration-test",
    });
    await postgres.onModuleInit();
    repository = new EcosystemRepository(postgres);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
  });

  it("creates, scopes, renames, and deletes owned ecosystems", async () => {
    await createNode("Organization", "owner", {
      id: "owner-id",
      orgId: "owner-org",
      name: "Owner",
    });

    const created = await repository.createEcosystem(
      "owner-org",
      "Test Ecosystem",
    );
    expect(created.status).toBe("created");
    if (created.status !== "created") throw new Error("ecosystem not created");

    await expect(
      repository.createEcosystem("owner-org", "Test Ecosystem"),
    ).resolves.toMatchObject({ status: "conflict" });
    await expect(
      repository.findOwnerOrganizationId(created.value.id),
    ).resolves.toBe("owner-org");

    const updated = await repository.updateEcosystem(
      "owner-org",
      created.value.id,
      "Renamed Ecosystem",
    );
    expect(updated).toMatchObject({
      status: "updated",
      value: { normalizedName: "renamed-ecosystem" },
    });
    await expect(
      repository.updateEcosystem("missing-org", created.value.id, "Nope"),
    ).resolves.toMatchObject({ status: "not_found" });

    const records = await repository.findOwnedEcosystems(
      "owner-org",
      "renamed-ecosystem",
    );
    expect(records).toHaveLength(1);
    expect(records[0].properties.name).toBe("Renamed Ecosystem");

    await expect(
      repository.deleteEcosystem("owner-org", created.value.id),
    ).resolves.toBe(true);
    await expect(repository.findOwnedEcosystems("owner-org")).resolves.toEqual(
      [],
    );
  });

  it("enforces stored-filter visibility and creator ownership", async () => {
    await createNode("Organization", "owner", {
      id: "owner-id",
      orgId: "owner-org",
      name: "Owner",
    });
    await createNode("User", "user", {
      id: "user-id",
      wallet: "0xAbC",
    });

    const created = await repository.createStoredFilter("owner-org", "0xabc", {
      name: "Engineering",
      filter: "tags=typescript",
      public: false,
    });
    expect(created).toMatchObject({ name: "Engineering", public: false });
    if (!created) throw new Error("stored filter not created");

    await expect(
      repository.findStoredFilters("owner-org", "0xabc"),
    ).resolves.toHaveLength(1);
    await expect(
      repository.findStoredFilters("owner-org", "0xstranger"),
    ).resolves.toEqual([]);
    await expect(
      repository.updateStoredFilter("owner-org", "0xstranger", created.id, {
        public: true,
      }),
    ).resolves.toBeUndefined();

    const updated = await repository.updateStoredFilter(
      "owner-org",
      "0xABC",
      created.id,
      { name: "Public Engineering", public: true },
    );
    expect(updated).toMatchObject({
      name: "Public Engineering",
      public: true,
    });
    await expect(
      repository.findStoredFilters("owner-org", "0xstranger"),
    ).resolves.toHaveLength(1);
    await expect(
      repository.deleteStoredFilter("owner-org", "0xstranger", created.id),
    ).resolves.toBe(false);
    await expect(
      repository.deleteStoredFilter("owner-org", "0xabc", created.id),
    ).resolves.toBe(true);
  });

  it("refreshes organization, project, and job ecosystem projections", async () => {
    await createNode("Organization", "owner", {
      id: "owner-id",
      orgId: "owner-org",
      name: "Owner",
      normalizedName: "owner",
    });
    const memberNodeId = await createNode("Organization", "member", {
      id: "member-id",
      orgId: "member-org",
      name: "Member",
      normalizedName: "member",
      summary: "Member summary",
      location: "Remote",
      headcountEstimate: 10,
    });
    const projectNodeId = await createNode("Project", "project", {
      id: "project-id",
      name: "Project",
      normalizedName: "project",
    });
    const jobNodeId = await createNode("StructuredJobpost", "job", {
      id: "job-id",
      shortUUID: "job-short",
      title: "Engineer",
    });
    await createRelationship(memberNodeId, projectNodeId, "HAS_PROJECT");

    await postgres.query(
      `
        INSERT INTO organization_search_documents (
          organization_node_id, organization_id, slug, name, normalized_name,
          payload, detail_payload
        ) VALUES (
          $1, 'member-org', 'member', 'Member', 'member',
          '{"orgId":"member-org","name":"Member","normalizedName":"member","projects":[],"fundingRounds":[],"investors":[],"ecosystems":[],"reviews":[],"grants":[]}',
          '{"orgId":"member-org","name":"Member","normalizedName":"member","projects":[],"fundingRounds":[],"investors":[],"ecosystems":[],"reviews":[],"grants":[],"jobs":[]}'
        )
      `,
      [memberNodeId],
    );
    await postgres.query(
      `
        INSERT INTO project_search_documents (
          project_node_id, project_id, slug, name, normalized_name,
          payload, detail_payload
        ) VALUES (
          $1, 'project-id', 'project', 'Project', 'project',
          '{"id":"project-id","name":"Project","ecosystems":[]}',
          '{"id":"project-id","name":"Project","ecosystems":[]}'
        )
      `,
      [projectNodeId],
    );
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          title, online, payload, detail_payload
        ) VALUES (
          $1, 'job-id', 'job-short', 'member-org', 'Engineer', true,
          '{"id":"job-id","shortUUID":"job-short","title":"Engineer"}',
          '{"id":"job-id","shortUUID":"job-short","title":"Engineer"}'
        )
      `,
      [jobNodeId],
    );

    const created = await repository.createEcosystem("owner-org", "Test Eco");
    if (created.status !== "created") throw new Error("ecosystem not created");
    const record = await repository.replaceMemberOrganizations(
      "owner-org",
      created.value.id,
      ["member-org"],
    );
    expect(record?.memberPayloads).toHaveLength(1);

    const [projection] = await postgres.query<{
      organizationEcosystems: string[];
      projectEcosystems: string[];
      jobEcosystems: string[];
      organizationPayload: Record<string, unknown>;
    }>(
      `
        SELECT
          organization.ecosystems AS "organizationEcosystems",
          project.ecosystems AS "projectEcosystems",
          job.ecosystems AS "jobEcosystems",
          organization.payload AS "organizationPayload"
        FROM organization_search_documents organization
        CROSS JOIN project_search_documents project
        CROSS JOIN job_search_documents job
        WHERE organization.organization_id = 'member-org'
          AND project.project_id = 'project-id'
          AND job.structured_jobpost_id = 'job-id'
      `,
    );
    expect(projection.organizationEcosystems).toEqual(["test-eco"]);
    expect(projection.projectEcosystems).toEqual(["test-eco"]);
    expect(projection.jobEcosystems).toEqual(["test-eco"]);
    expect(projection.organizationPayload.ecosystems).toEqual(["Test Eco"]);

    await repository.replaceMemberOrganizations(
      "owner-org",
      created.value.id,
      [],
    );
    const [cleared] = await postgres.query<{ ecosystems: string[] }>(
      `
        SELECT ecosystems
        FROM job_search_documents
        WHERE structured_jobpost_id = 'job-id'
      `,
    );
    expect(cleared.ecosystems).toEqual([]);
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
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', '{}'::jsonb)
      `,
      [sourceNodeId, targetNodeId, type],
    );
  }
});
