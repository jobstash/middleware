import { ConflictException, INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { AuthService } from "src/auth/auth.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { prepareMcpTestTables } from "src/mcp/mcp-test-fixture";
import { PostgresService } from "src/postgres/postgres.service";
import { CheckWalletPermissions } from "src/shared/constants";
import { CareerRepository } from "./career.repository";
import { ConnectionInputGuard } from "./connection-input.guard";
import { deviceConnectionFixture } from "./device-execution.fixture";
import { VoiceConnectionController } from "./voice-connection.controller";
import { VoiceConnectionService } from "./voice-connection.service";

const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Device voice connection metadata (isolated PostgreSQL)", () => {
  let db: PostgresService, voice: VoiceConnectionService, app: INestApplication;
  let deviceId: string, reasoningId: string, connectionId: string, sessionId: string;
  const origin = "https://recruiters.example";
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/jobstash_mcp_test") throw new Error("Dedicated test database required");
    db = new PostgresService({ url: url!, applicationName: "device-voice-connection-tests", maxConnections: 12, statementTimeoutMs: 10000 });
    await db.onModuleInit();
    await prepareMcpTestTables(db);
    const module = await Test.createTestingModule({
      controllers: [VoiceConnectionController],
      providers: [VoiceConnectionService, PBACGuard, ConnectionInputGuard,
        { provide: PostgresService, useValue: db }, { provide: CareerRepository, useValue: new CareerRepository(db) },
        { provide: ConfigService, useValue: new ConfigService({ RECRUITERS_PUBLIC_ORIGIN: origin }) },
        { provide: AuthService, useValue: { getSession: async (req: { headers: Record<string, string> }) =>
          ["Bearer alice", "Bearer bob"].includes(req.headers.authorization) ? { address: req.headers.authorization.slice(7), permissions: [CheckWalletPermissions.USER] } : undefined } },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true }); app.useLogger(false); await app.init();
    voice = app.get(VoiceConnectionService);
  });
  afterAll(async () => { await app?.close(); await db?.onModuleDestroy(); });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    const reasoning = await deviceConnectionFixture(db, "1");
    reasoningId = reasoning.id; deviceId = reasoning.device.id; connectionId = randomUUID(); sessionId = randomUUID();
    await db.query(`INSERT INTO candidate_voice_connections(id,user_node_id,status,generation,device_id,public_state) VALUES($1,1,'connected',0,$2,'{"execution":"device","model":"gpt-live-1"}')`, [connectionId, deviceId]);
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id) VALUES($1,1,$2)", [sessionId, reasoningId]);
  });
  it("does not expose an upload or reasoning-key-copy endpoint", async () => {
    for (const body of [{ apiKey: "rejected-test-value" }, { reasoningConnectionId: reasoningId }]) {
      await request(app.getHttpServer()).post("/profile/voice/connection").set("Authorization", "Bearer alice").set("Origin", origin).send({ requestId: randomUUID(), revision: 0, ...body }).expect(404);
    }
    const [row] = await db.query("SELECT generation,public_state FROM candidate_voice_connections WHERE id=$1", [connectionId]);
    expect(row).toEqual({ generation: 0, public_state: { execution: "device", model: "gpt-live-1" } });
  });
  it("returns only owned connection state and reflects device revocation", async () => {
    expect(await voice.connection("alice")).toMatchObject({ id: connectionId, status: "connected", revision: 0 });
    expect(await voice.connection("bob")).toMatchObject({ id: null, status: "disconnected" });
    await db.query("UPDATE candidate_devices SET status='revoked' WHERE id=$1", [deviceId]);
    expect(await voice.connection("alice")).toMatchObject({ id: connectionId, status: "disconnected" });
  });
  it("revokes voice once, closes live authorization, and preserves reasoning and transcripts", async () => {
    const id = randomUUID();
    await db.query(`INSERT INTO candidate_voice_sessions(id,user_node_id,session_id,voice_connection_id,generation,device_id,request_id,idempotency_hash,status,transcript)
      VALUES($1,1,$2,$3,0,$4,$5,'fixture','active',$6)`, [id, sessionId, connectionId, deviceId, randomUUID(), JSON.stringify([{ event_id: "part", speaker: "user", delta: "saved words", start_ms: 0, end_ms: 10 }])]);
    const input = { requestId: randomUUID(), revision: 0, connectionId };
    const saved = await voice.disconnect("alice", input);
    expect(saved).toMatchObject({ id: connectionId, status: "disconnected", revision: 1 });
    expect(await voice.disconnect("alice", input)).toEqual(saved);
    await expect(voice.disconnect("alice", { requestId: randomUUID(), revision: 0, connectionId })).rejects.toBeInstanceOf(ConflictException);
    expect((await db.query("SELECT status FROM candidate_ai_connections WHERE id=$1", [reasoningId]))[0].status).toBe("connected");
    const [session] = await db.query("SELECT status,transcript FROM candidate_voice_sessions WHERE id=$1", [id]);
    expect(session.status).toBe("closing");
    expect(session.transcript[0].delta).toBe("saved words");
  });
  it("rejects secret fields and foreign-origin disconnects without changing metadata", async () => {
    await request(app.getHttpServer()).delete("/profile/voice/connection").set("Authorization", "Bearer alice").set("Origin", origin).send({ requestId: randomUUID(), revision: 0, connectionId, apiKey: "rejected-test-value" }).expect(400);
    await request(app.getHttpServer()).delete("/profile/voice/connection").set("Authorization", "Bearer alice").set("Origin", "https://foreign.example").send({ requestId: randomUUID(), revision: 0 }).expect(403);
    expect(await voice.connection("alice")).toMatchObject({ status: "connected", revision: 0 });
  });
});
