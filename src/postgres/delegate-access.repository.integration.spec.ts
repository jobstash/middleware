import { DelegateAccessRepository } from "./delegate-access.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("DelegateAccessRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: DelegateAccessRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-delegate-access-integration-test",
    });
    await postgres.onModuleInit();
    repository = new DelegateAccessRepository(postgres);
  });

  afterAll(async () => postgres.onModuleDestroy());

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    const sourceId = await createNode("Organization", "source", {
      id: "source-id",
      orgId: "source-org",
      name: "Source Org",
      normalizedName: "source-org",
    });
    const targetId = await createNode("Organization", "target", {
      id: "target-id",
      orgId: "target-org",
      name: "Target Org",
      normalizedName: "target-org",
    });
    const requestorId = await createNode("User", "requestor", {
      id: "requestor-id",
      wallet: "0xrequestor",
    });
    const grantorId = await createNode("User", "grantor", {
      id: "grantor-id",
      wallet: "0xgrantor",
    });
    await createRelationship(requestorId, sourceId, "VERIFIED_FOR_ORG", {
      credential: "email",
      account: "requestor@example.com",
    });
    await createRelationship(grantorId, targetId, "VERIFIED_FOR_ORG", {
      credential: "email",
      account: "grantor@example.com",
    });
  });

  it("creates and lists a parameterized delegate request", async () => {
    await expect(
      repository.request({
        fromOrganizationId: "source-org",
        toOrganizationId: "target-org",
        requestorAddress: "0xrequestor",
        authToken: "secret-token",
        expiryDurationMs: 60_000,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.getStatus("source-org", "target-org"),
    ).resolves.toBe("pending");
    const [request] = await repository.getRequests("target-org");
    expect(request).toMatchObject({
      fromOrgId: "source-org",
      toOrgId: "target-org",
      requestor: "requestor@example.com",
      authToken: "secret-token",
      status: "pending",
    });
  });

  it("accepts only the current unexpired token", async () => {
    await repository.request({
      fromOrganizationId: "source-org",
      toOrganizationId: "target-org",
      requestorAddress: "0xrequestor",
      authToken: "secret-token",
      expiryDurationMs: 60_000,
    });
    await expect(
      repository.accept({
        fromOrganizationId: "source-org",
        toOrganizationId: "target-org",
        grantorAddress: "0xgrantor",
        authToken: "wrong-token",
      }),
    ).resolves.toBe(false);
    await expect(
      repository.accept({
        fromOrganizationId: "source-org",
        toOrganizationId: "target-org",
        grantorAddress: "0xgrantor",
        authToken: "secret-token",
      }),
    ).resolves.toBe(true);
    const [request] = await repository.getRequests("source-org");
    expect(request).toMatchObject({
      status: "accepted",
      grantor: "grantor@example.com",
    });
    expect(request.authToken).toBeUndefined();
  });

  it("rejects expired requests", async () => {
    await repository.request({
      fromOrganizationId: "source-org",
      toOrganizationId: "target-org",
      requestorAddress: "0xrequestor",
      authToken: "expired-token",
      expiryDurationMs: -1,
    });
    await expect(
      repository.accept({
        fromOrganizationId: "source-org",
        toOrganizationId: "target-org",
        grantorAddress: "0xgrantor",
        authToken: "expired-token",
      }),
    ).resolves.toBe(false);
  });

  it("revokes accepted access", async () => {
    await repository.request({
      fromOrganizationId: "source-org",
      toOrganizationId: "target-org",
      requestorAddress: "0xrequestor",
      authToken: "secret-token",
      expiryDurationMs: 60_000,
    });
    await repository.accept({
      fromOrganizationId: "source-org",
      toOrganizationId: "target-org",
      grantorAddress: "0xgrantor",
      authToken: "secret-token",
    });
    await expect(
      repository.revoke({
        fromOrganizationId: "source-org",
        toOrganizationId: "target-org",
        actorAddress: "0xgrantor",
      }),
    ).resolves.toBe(true);
    await expect(
      repository.getStatus("source-org", "target-org"),
    ).resolves.toBe("revoked");
  });

  it("re-requesting replaces stale relationship state", async () => {
    await repository.request({
      fromOrganizationId: "source-org",
      toOrganizationId: "target-org",
      requestorAddress: "0xrequestor",
      authToken: "first",
      expiryDurationMs: 60_000,
    });
    await repository.request({
      fromOrganizationId: "source-org",
      toOrganizationId: "target-org",
      requestorAddress: "0xrequestor",
      authToken: "second",
      expiryDurationMs: 60_000,
    });
    const [request] = await repository.getRequests("source-org");
    expect(request.authToken).toBe("second");
    const [count] = await postgres.query<{ value: string }>(`
      SELECT count(*)::text AS value
      FROM graph_relationships
      WHERE type = 'HAS_DELEGATE_ACCESS'
    `);
    expect(count.value).toBe("1");
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
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', $4::jsonb)
      `,
      [sourceId, targetId, type, JSON.stringify(properties)],
    );
  }
});
