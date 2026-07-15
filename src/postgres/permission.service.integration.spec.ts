import { PermissionService } from "src/user/permission.service";
import { GraphRepository } from "./graph.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("PermissionService PostgreSQL integration", () => {
  let postgres: PostgresService;
  let service: PermissionService;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-permission-integration-test",
    });
    await postgres.onModuleInit();
    service = new PermissionService(new GraphRepository(postgres));
  });

  afterAll(async () => postgres.onModuleDestroy());

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    await postgres.query(`
      INSERT INTO graph_nodes (label, labels, node_key, properties)
      VALUES (
        'User', ARRAY['User']::text[], 'user-1',
        '{"id":"user-1","wallet":"0xabc"}'
      )
    `);
  });

  it("creates, grants, lists, and revokes permissions", async () => {
    await service.create({ name: "admin" });
    await expect(
      service.grantUserPermission("0xabc", "admin"),
    ).resolves.toMatchObject({ success: true });
    await expect(service.userHasPermission("0xabc", "admin")).resolves.toBe(
      true,
    );
    await expect(
      service.getPermissionsForWallet("0xabc"),
    ).resolves.toMatchObject([{ name: "admin" }]);
    await expect(
      service.revokeUserPermission("0xabc", "admin"),
    ).resolves.toMatchObject({ success: true });
    await expect(service.userHasPermission("0xabc", "admin")).resolves.toBe(
      false,
    );
  });

  it("synchronizes permissions in one relationship replacement", async () => {
    await service.create({ name: "read" });
    await service.create({ name: "write" });
    await service.create({ name: "admin" });
    await service.syncUserPermissions("0xabc", ["read", "write"]);
    await service.syncUserPermissions("0xabc", ["admin"]);
    const permissions = await service.getPermissionsForWallet("0xabc");
    expect(permissions.map(permission => permission.name)).toEqual(["admin"]);
  });

  it("does not grant unknown permissions", async () => {
    await expect(
      service.grantUserPermission("0xabc", "missing"),
    ).resolves.toEqual({ success: false, message: "Permission not found" });
  });
});
