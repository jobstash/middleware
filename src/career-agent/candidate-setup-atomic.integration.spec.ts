import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { prepareMcpTestTables } from "src/mcp/mcp-test-fixture";
import { CareerRepository } from "./career.repository";
import { CandidateSetupService } from "./candidate-setup.service";
import { CandidateInvocationContext } from "./candidate-context";
import { deviceConnectionFixture } from "./device-execution.fixture";

const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Paired-device setup completion (isolated PostgreSQL)", () => {
  let db: PostgresService, setup: CandidateSetupService;
  let oauth: Extract<CandidateInvocationContext, { kind: "oauth" }>;
  const session: CandidateInvocationContext = { kind: "session", owner: "1", wallet: "alice" };
  const mutation = () => ({ requestId: randomUUID(), revision: 0 });
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/jobstash_mcp_test") throw Error("Dedicated test database required");
    db = new PostgresService({ url: url!, applicationName: "candidate-device-setup-tests", maxConnections: 8, statementTimeoutMs: 10000 });
    await db.onModuleInit();
    await prepareMcpTestTables(db);
    setup = new CandidateSetupService(db, new CareerRepository(db), new ConfigService({ RECRUITERS_PUBLIC_ORIGIN: "https://recruiters.example" }));
  });
  afterAll(async () => db?.onModuleDestroy());
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    const clientId = randomUUID(), grantId = randomUUID();
    await db.query("INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,'setup tests','[]')", [clientId]);
    await db.query("INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at) VALUES($1,1,$2,'https://mcp.example','account:read account:write',now()+interval '1 day')", [grantId, clientId]);
    oauth = { kind: "oauth", owner: "1", wallet: "alice", grantId, clientId, scopes: ["account:read", "account:write"] };
  });

  it("completes owned offline metadata once and rejects another resource or external completion", async () => {
    const intent = await setup.create(oauth, "provider", { ...mutation(), provider: "openai" });
    const connection = await deviceConnectionFixture(db, "1", { online: false });
    const result = { kind: "connection" as const, id: connection.id };
    await expect(setup.complete(oauth, intent.id, result)).rejects.toThrow();
    expect(await setup.complete(session, intent.id, result)).toMatchObject({ status: "completed", result });
    expect(await setup.complete(session, intent.id, result)).toMatchObject({ status: "completed", result });
    const other = await deviceConnectionFixture(db, "1");
    await expect(setup.complete(session, intent.id, { ...result, id: other.id })).rejects.toThrow();
    await expect(setup.complete(session, intent.id, { ...result, revision: 1 })).rejects.toThrow("another result");
  });

  it.each(["revoked", "expired", "scope", "device", "provider", "owner"])("rechecks %s authority before saving the completion reference", async reason => {
    const intent = await setup.create(oauth, "provider", { ...mutation(), provider: "openai" });
    const connection = await deviceConnectionFixture(db, reason === "owner" ? "2" : "1", { provider: reason === "provider" ? "anthropic" : "openai" });
    if (reason === "revoked") await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [oauth.grantId]);
    if (reason === "expired") await db.query("UPDATE candidate_setup_intents SET expires_at=now()-interval '1 second' WHERE id=$1", [intent.id]);
    if (reason === "scope") await db.query("UPDATE mcp_grants SET scope='account:read' WHERE id=$1", [oauth.grantId]);
    if (reason === "device") await db.query("UPDATE candidate_devices SET status='revoked' WHERE id=$1", [connection.device.id]);
    await expect(setup.complete(session, intent.id, { kind: "connection", id: connection.id })).rejects.toThrow();
    expect(await db.query("SELECT result_ref FROM candidate_setup_intents WHERE id=$1", [intent.id])).toEqual([{ result_ref: null }]);
  });
});
