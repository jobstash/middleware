import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { prepareMcpTestTables } from "src/mcp/mcp-test-fixture";
import { PostgresService } from "src/postgres/postgres.service";
import { AgentService } from "./agent.service";
import { CareerRepository } from "./career.repository";
import { createDeviceAgent, deviceConnectionFixture, pairedDeviceFixture } from "./device-execution.fixture";
import { CreateDeviceVoiceInput } from "./voice-connection.dto";
import { parseDeviceVoiceEvent, parseVoiceClose } from "./voice-protocol";
import { VoiceService, voiceRequestId } from "./voice.service";

const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Device voice session coordination (isolated PostgreSQL)", () => {
  let db: PostgresService, career: CareerRepository, agent: AgentService, voice: VoiceService;
  let alice: { device: { id: string; owner: string }; connectionId: string; sessionId: string; reasoningId: string }, bob: typeof alice;
  const config = new ConfigService({ LOCAL_ONLY: "false" });
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/jobstash_mcp_test") throw new Error("Dedicated test database required");
    db = new PostgresService({ url: url!, applicationName: "device-voice-tests", maxConnections: 16, statementTimeoutMs: 10000 });
    await db.onModuleInit(); await prepareMcpTestTables(db);
    career = new CareerRepository(db); agent = createDeviceAgent(db, career, config);
    voice = new VoiceService(db, career, agent, config);
  });
  afterAll(async () => { await voice?.onModuleDestroy(); await db?.onModuleDestroy(); });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('alice',1,'active',now()+interval '1 day'),('bob',2,'active',now()+interval '1 day')");
    alice = await seed("1"); bob = await seed("2");
  });
  async function seed(owner: string) {
    const reasoning = await deviceConnectionFixture(db, owner);
    const connectionId = randomUUID(), sessionId = randomUUID();
    await db.query(`INSERT INTO candidate_voice_connections(id,user_node_id,status,generation,device_id,public_state) VALUES($1,$2,'connected',0,$3,'{"execution":"device","model":"gpt-live-1"}')`, [connectionId, owner, reasoning.device.id]);
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id) VALUES($1,$2,$3)", [sessionId, owner, reasoning.id]);
    return { device: reasoning.device, connectionId, sessionId, reasoningId: reasoning.id };
  }
  async function start(who = alice) {
    const input = { requestId: randomUUID(), sessionId: who.sessionId, connectionId: who.connectionId };
    const saved = await voice.create(who.device, input);
    await voice.event(who.device, saved.voiceSessionId, { eventId: randomUUID(), event: { kind: "active" } });
    return { ...saved, input };
  }
  async function transcript(id: string, eventId = randomUUID(), partId = randomUUID()) {
    const input = { eventId, event: { kind: "transcript", transcript: { event_id: partId, speaker: "user", delta: "Help me describe my experience", start_ms: 0, end_ms: 100 } } };
    await voice.event(alice.device, id, input);
    return input;
  }
  async function delegate(id: string, delegationId = "delegation_1") {
    const input = { eventId: randomUUID(), event: { kind: "delegation", id: delegationId, offset_ms: 1000 } };
    await voice.event(alice.device, id, input);
    return input;
  }
  it("reserves only the owner, device, conversation and current connection and never recreates a billed request", async () => {
    const saved = await start();
    await expect(voice.create(alice.device, saved.input)).rejects.toBeInstanceOf(ConflictException);
    await expect(voice.create(alice.device, { ...saved.input, requestId: randomUUID(), sessionId: bob.sessionId })).rejects.toBeInstanceOf(ConflictException);
    await expect(voice.heartbeat(bob.device, saved.voiceSessionId)).rejects.toBeInstanceOf(NotFoundException);
    const otherDevice = await pairedDeviceFixture(db, "1");
    await expect(voice.heartbeat(otherDevice, saved.voiceSessionId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(voice.close("bob", saved.voiceSessionId)).rejects.toBeInstanceOf(NotFoundException);
    await voice.closeDevice(alice.device, saved.voiceSessionId, {});
    await expect(voice.create(alice.device, saved.input)).rejects.toBeInstanceOf(ConflictException);
    expect((await db.query("SELECT id FROM candidate_voice_sessions WHERE user_node_id=1")).map(row => row.id)).toEqual([saved.voiceSessionId]);
  });
  it("does not schedule transcript fragments, deduplicates delegation IDs and preserves stable device request IDs across restart", async () => {
    const saved = await start();
    const part = await transcript(saved.voiceSessionId);
    await voice.event(alice.device, saved.voiceSessionId, part);
    await voice.heartbeat(alice.device, saved.voiceSessionId);
    expect(await db.query("SELECT id FROM candidate_agent_requests")).toEqual([]);
    const delegation = await delegate(saved.voiceSessionId);
    await voice.event(alice.device, saved.voiceSessionId, { ...delegation, eventId: randomUUID() });
    const secondProcess = new VoiceService(db, career, agent, config);
    const snapshot = await secondProcess.heartbeat(alice.device, saved.voiceSessionId);
    const id = voiceRequestId(saved.voiceSessionId, "delegation_1");
    expect(snapshot.delegatedRequestIds).toEqual([id]);
    expect(snapshot.delegations).toEqual([{ requestId: id, status: "waiting_for_device" }]);
    await voice.heartbeat(alice.device, saved.voiceSessionId);
    expect((await db.query("SELECT id FROM candidate_agent_requests")).map(row => row.id)).toEqual([id]);
    expect((await db.query("SELECT device_id FROM candidate_voice_sessions WHERE id=$1", [saved.voiceSessionId]))[0].device_id).toBe(alice.device.id);
  });
  it("closes stale authorization and preserves existing delegated work for explicit cancellation", async () => {
    const saved = await start(); await transcript(saved.voiceSessionId); await delegate(saved.voiceSessionId);
    const before = await voice.heartbeat(alice.device, saved.voiceSessionId);
    await db.query("UPDATE candidate_voice_sessions SET heartbeat_at=now()-interval '46 seconds' WHERE id=$1", [saved.voiceSessionId]);
    const ended = await voice.heartbeat(alice.device, saved.voiceSessionId);
    expect(ended.status).toBe("closed");
    expect(ended.delegatedRequestIds).toEqual(before.delegatedRequestIds);
    const context = { kind: "session" as const, owner: "1", wallet: "alice" };
    await agent.candidateCancel(context, before.delegatedRequestIds[0], { requestId: randomUUID(), revision: ended.revision });
    expect((await db.query("SELECT status FROM candidate_agent_requests WHERE id=$1", [before.delegatedRequestIds[0]]))[0].status).toBe("cancelled");
    await expect(delegate(saved.voiceSessionId, "late")).rejects.toBeInstanceOf(ConflictException);
  });
  it("fences connection generations and suppresses new work after membership expires", async () => {
    const saved = await start(); await transcript(saved.voiceSessionId); await delegate(saved.voiceSessionId);
    await db.query("UPDATE candidate_voice_connections SET generation=generation+1 WHERE id=$1", [alice.connectionId]);
    expect((await voice.heartbeat(alice.device, saved.voiceSessionId)).status).toBe("closed");
    expect(await db.query("SELECT id FROM candidate_agent_requests")).toEqual([]);
    const next = await start(); await transcript(next.voiceSessionId); await delegate(next.voiceSessionId);
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 minute' WHERE user_node_id=1");
    expect((await voice.heartbeat(alice.device, next.voiceSessionId)).status).toBe("closed");
    expect(await db.query("SELECT id FROM candidate_agent_requests")).toEqual([]);
  });
  it("rejects changed event replay and retains only bounded transcript and usage fields", async () => {
    const saved = await start(); const part = await transcript(saved.voiceSessionId);
    await expect(voice.event(alice.device, saved.voiceSessionId, { ...part, event: { ...part.event, transcript: { ...part.event.transcript, delta: "changed" } } })).rejects.toBeInstanceOf(ConflictException);
    for (let index = 0; index < 12; index++) await voice.event(alice.device, saved.voiceSessionId, { eventId: randomUUID(), event: { kind: "transcript", transcript: { ...part.event.transcript, event_id: `part-${index}`, delta: "words ".repeat(300) } } });
    const [row] = await db.query("SELECT transcript FROM candidate_voice_sessions WHERE id=$1", [saved.voiceSessionId]);
    expect(Buffer.byteLength(JSON.stringify(row.transcript))).toBeLessThanOrEqual(8192);
    await expect(voice.closeDevice(alice.device, saved.voiceSessionId, { usage: { seconds: 1, apiKey: "rejected-test-value" } })).rejects.toBeInstanceOf(BadRequestException);
    await voice.closeDevice(alice.device, saved.voiceSessionId, { usage: { seconds: 7.5 } });
    expect((await db.query("SELECT usage,usage_complete FROM candidate_voice_sessions WHERE id=$1", [saved.voiceSessionId]))[0]).toEqual({ usage: { seconds: 7.5 }, usage_complete: true });
  });
  it("continues to prohibit live voice in local-only mode before reserving any session", async () => {
    const local = new VoiceService(db, career, agent, new ConfigService({ LOCAL_ONLY: "true" }));
    await expect(local.create(alice.device, { requestId: randomUUID(), sessionId: alice.sessionId, connectionId: alice.connectionId })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await db.query("SELECT id FROM candidate_voice_sessions")).toEqual([]);
  });
});

describe("Signed voice input boundary", () => {
  it("rejects credentials, SDP, raw provider payloads and invalid transcript timing", async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, validationError: { target: false, value: false } });
    const create = { requestId: randomUUID(), sessionId: randomUUID(), connectionId: randomUUID() };
    for (const extra of [{ apiKey: "rejected-test-value" }, { offerSdp: "v=0" }, { providerSessionId: "live_private" }])
      await expect(pipe.transform({ ...create, ...extra }, { type: "body", metatype: CreateDeviceVoiceInput })).rejects.toBeInstanceOf(BadRequestException);
    const event = { eventId: randomUUID(), event: { kind: "transcript", transcript: { event_id: "part", speaker: "user", delta: " words", start_ms: 1, end_ms: 2 } } };
    expect(parseDeviceVoiceEvent(event)).toEqual(event);
    expect(() => parseDeviceVoiceEvent({ ...event, apiKey: "rejected-test-value" })).toThrow(BadRequestException);
    expect(() => parseDeviceVoiceEvent({ ...event, event: { ...event.event, transcript: { ...event.event.transcript, end_ms: 0 } } })).toThrow(BadRequestException);
    expect(() => parseDeviceVoiceEvent({ ...event, event: { ...event.event, transcript: { ...event.event.transcript, audio: "private" } } })).toThrow(BadRequestException);
    expect(() => parseVoiceClose({ usage: { seconds: Number.NaN } })).toThrow(BadRequestException);
  });
});
