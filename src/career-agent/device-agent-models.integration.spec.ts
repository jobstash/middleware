import { prepareMcpScreeningTestTables } from "src/mcp/mcp-test-fixture";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { AgentService } from "./agent.service";
import { ScreeningService } from "./screening.service";
import { ScreeningGovernanceService } from "./screening-governance.service";
import { bindScreeningSourceFixture } from "./screening.fixture";
import { installCandidateGeographyFixture, saveCandidateGeographyFixture } from "./candidate-geographic-eligibility.fixture";
import { screeningEvidenceSchema } from "./screening-workflow";
import { createDeviceAgent, deviceConnectionFixture } from "./device-execution.fixture";
import { DeviceIdentity } from "./device-execution.protocol";

const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Device agent model selection and scheduling (isolated PostgreSQL)", () => {
  let db: PostgresService, career: CareerRepository, screening: ScreeningService, agent: AgentService;
  const config = new ConfigService({ CAREER_DATA_PROTECTION_KEY: randomBytes(32).toString("hex"), CAREER_AGENT_CONCURRENCY: 4 });
  const schema = `device_models_${randomUUID().replace(/-/g, "")}`;
  const input = () => ({ requestId: randomUUID(), revision: 0 });
  const models = [
    { id: "gpt-6-sol", label: "GPT-6-Sol", reasoningEfforts: ["none", "low", "high", "adaptive-v2"], defaultReasoningEffort: "high" },
    { id: "gpt-6-luna", label: "GPT-6-Luna", reasoningEfforts: ["low", "high"], defaultReasoningEffort: "low" },
    { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", reasoningEfforts: ["low"], defaultReasoningEffort: "low" },
    { id: "gpt-5.6-sol", label: "GPT-5.6-Sol", reasoningEfforts: ["low"], defaultReasoningEffort: "low" },
    { id: "provider-new-model", label: "New model", reasoningEfforts: [], defaultReasoningEffort: null },
  ];
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/jobstash_mcp_test") throw Error("Dedicated test database required");
    db = new PostgresService({ url: url!, applicationName: "device-model-tests", maxConnections: 12, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await prepareMcpScreeningTestTables(db);
    await installCandidateGeographyFixture(db);
    career = new CareerRepository(db);
    screening = new ScreeningService(db, career, config, new ScreeningGovernanceService(db, career));
    agent = createDeviceAgent(db, career, config, screening);
  });
  afterAll(async () => { if (db) { await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.onModuleDestroy(); } });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE candidate_screening_jobs CASCADE");
    await db.query("TRUNCATE organization_search_documents,project_search_documents,candidate_cv_job_scores,job_availability_extractions,job_work_location_options");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('alice-paid',1,'active',now()+interval '1 day'),('bob-paid',2,'active',now()+interval '1 day')");
  });
  async function connect(wallet = "alice") {
    const connection = await deviceConnectionFixture(db, await career.owner(wallet), { provider: "codex", model: "gpt-6-sol" });
    await db.query("UPDATE candidate_ai_connections SET model_catalog=$2 WHERE id=$1", [connection.id, JSON.stringify(models)]);
    return connection;
  }
  async function queue(wallet: string, connectionId: string) {
    const session = await agent.session(wallet, { ...input(), connectionId });
    return agent.prompt(wallet, session.id, { ...input(), revision: session.revision, prompt: "Find jobs" });
  }
  async function complete(device: DeviceIdentity, task: Record<string, unknown>) {
    await agent.deviceEvent(device, String(task.id), { type: "completed", leaseId: task.leaseId, eventId: randomUUID() });
  }
  async function queueScreening(connectionId: string) {
    const document = await career.pasteCv("alice", "I build accessible interfaces.", "CV", input());
    await bindScreeningSourceFixture(db, document.id);
    await screening.savePreferences("alice", { currentLocation: "Berlin", relocation: "not_open" });
    await db.query("INSERT INTO candidate_career_profiles(user_node_id,directions) VALUES(1,ARRAY['Engineering'])");
    const [organization] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{\"orgId\":\"device-org\"}') RETURNING id");
    await db.query("INSERT INTO organization_search_documents(organization_node_id,organization_id,payload) VALUES($1,'device-org','{\"name\":\"Company\"}')", [organization.id]);
    const [job] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost','{}') RETURNING id");
    await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,title,organization_id,payload,filter_labels) VALUES($1,'device-job','Engineer','device-org','{}','{"classifications":{"engineering":"ENGINEERING"}}')`, [job.id]);
    const [ad] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('Jobpost','{\"content\":\"Build accessible interfaces. Remote worldwide.\"}') RETURNING id");
    await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_STRUCTURED_JOBPOST')", [ad.id, job.id]);
    await saveCandidateGeographyFixture(db, job.id, ad.id);
    const run = await screening.start("alice", document.id, connectionId, input());
    await db.transaction(executor => screening.enqueue(executor));
    const [request] = await db.query("SELECT request_id AS id FROM candidate_screening_jobs WHERE run_id=$1", [run.id]);
    return request;
  }

  it("returns to screening after interactive completion and resumes one fenced attempt", async () => {
    const { id, device } = await connect();
    const background = await queueScreening(id);
    await db.query("UPDATE candidate_agent_requests SET created_at=now()-interval '1 minute' WHERE id=$1", [background.id]);
    const interactive = await queue("alice", id);
    const task = (await agent.claimDevice(device, id))!;
    expect(task).toMatchObject({ id: interactive.id });
    expect(await agent.claimDevice(device, id)).toEqual(task);
    await complete(device, task);
    expect(await agent.claimDevice(device, id)).toMatchObject({ id: background.id, screening: true, screeningStage: "evidence", screeningSchema: screeningEvidenceSchema });
  });
  it("rejects another owner's catalog, selection, disconnect and device claim", async () => {
    const alice = await connect(), bob = await connect("bob");
    await queue("alice", alice.id);
    await expect(agent.connectionModels("bob", alice.id)).rejects.toThrow();
    await expect(agent.selectConnectionModel("bob", alice.id, { ...input(), model: "gpt-6-sol", reasoningEffort: "high" })).rejects.toThrow();
    await expect(agent.disconnect("bob", alice.id, input())).rejects.toThrow();
    await expect(agent.claimDevice(bob.device, alice.id)).rejects.toThrow();
    expect(await agent.claimDevice(alice.device, alice.id)).toMatchObject({ connectionId: alice.id });
  });
  it.each(["high", "none", "adaptive-v2", null])("persists an owned model and %s effort across restart and replay", async reasoningEffort => {
    const { id, device } = await connect();
    const selection = { ...input(), model: "gpt-6-sol", reasoningEffort };
    const saved = await agent.selectConnectionModel("alice", id, selection);
    expect(saved).toMatchObject({ model: selection.model, reasoningEffort, revision: 1 });
    expect(await agent.selectConnectionModel("alice", id, selection)).toEqual(saved);
    const restarted = createDeviceAgent(db, new CareerRepository(db), config);
    expect(await restarted.connections("alice")).toEqual([expect.objectContaining({
      id, details: expect.objectContaining({ execution: "device", deviceId: device.id, model: selection.model, modelRevision: 1, reasoningEffort }),
    })]);
    expect(await agent.connectionModels("alice", id)).toMatchObject({ model: selection.model, reasoningEffort, revision: 1 });
  });
  it.each(["high", "none", null])("pins queued %s effort while later work uses the saved choice", async reasoningEffort => {
    const { id, device } = await connect();
    await agent.selectConnectionModel("alice", id, { ...input(), model: "gpt-6-sol", reasoningEffort });
    const first = await queue("alice", id);
    await agent.selectConnectionModel("alice", id, { ...input(), revision: 1, model: "gpt-6-luna", reasoningEffort: "high" });
    const task = (await agent.claimDevice(device, id))!;
    expect(task).toMatchObject({ id: first.id, model: "gpt-6-sol", reasoningEffort });
    await agent.selectConnectionModel("alice", id, { ...input(), revision: 2, model: "gpt-6-luna", reasoningEffort: "low" });
    expect((await db.query("SELECT status,requested_model,requested_reasoning_effort FROM candidate_agent_requests WHERE id=$1", [first.id]))[0])
      .toEqual({ status: "running", requested_model: "gpt-6-sol", requested_reasoning_effort: reasoningEffort });
    expect(await agent.claimDevice(device, id)).toEqual(task);
    await agent.deviceHeartbeat(device, first.id, String(task.leaseId));
    await expect(agent.deviceEvent(device, first.id, { type: "usage", leaseId: task.leaseId, eventId: randomUUID(), model: "gpt-6-luna", inputTokens: 1, outputTokens: 1 }))
      .rejects.toThrow("Reported model does not match");
    await agent.deviceEvent(device, first.id, { type: "usage", leaseId: task.leaseId, eventId: randomUUID(), model: "gpt-6-sol", inputTokens: 1, outputTokens: 1 });
    await complete(device, task);
    const next = await queue("alice", id);
    expect(await agent.claimDevice(device, id)).toMatchObject({ id: next.id, model: "gpt-6-luna", reasoningEffort: "low" });
  });
  it("retains catalogs beyond 200 models and the last model's effort metadata", async () => {
    const { id } = await connect();
    const catalog = Array.from({ length: 225 }, (_, index) => ({ id: `provider-model-${index}`, label: `Model ${index}`, reasoningEfforts: ["low", "adaptive-v2"], defaultReasoningEffort: "adaptive-v2" }));
    await db.query("UPDATE candidate_ai_connections SET model_catalog=$2 WHERE id=$1", [id, JSON.stringify(catalog)]);
    expect((await agent.connectionModels("alice", id)).models).toEqual(catalog);
    expect(await agent.selectConnectionModel("alice", id, { ...input(), model: "provider-model-224", reasoningEffort: "adaptive-v2" }))
      .toMatchObject({ model: "provider-model-224", reasoningEffort: "adaptive-v2", revision: 1 });
  });
  it.each([
    { reasoningEfforts: ["high", "high"], defaultReasoningEffort: "high" },
    { reasoningEfforts: ["high\n"], defaultReasoningEffort: null },
    { reasoningEfforts: ["high"], defaultReasoningEffort: "low" },
    { reasoningEfforts: [], defaultReasoningEffort: "high" },
  ])("rejects malformed persisted catalog metadata without changing selection", async metadata => {
    const { id } = await connect();
    const before = await agent.connections("alice");
    await db.query("UPDATE candidate_ai_connections SET model_catalog=$2 WHERE id=$1", [id, JSON.stringify([{ id: "gpt-6-sol", label: "Sol", ...metadata }])]);
    await expect(agent.connectionModels("alice", id)).rejects.toThrow();
    expect(await agent.connections("alice")).toEqual(before);
  });
  it("rejects stale and invented selections without rewriting the saved choice", async () => {
    const { id } = await connect();
    await expect(agent.selectConnectionModel("alice", id, { ...input(), model: "invented-model", reasoningEffort: null })).rejects.toThrow();
    await agent.selectConnectionModel("alice", id, { ...input(), model: "gpt-6-sol", reasoningEffort: "high" });
    await expect(agent.selectConnectionModel("alice", id, { ...input(), model: "gpt-6-sol", reasoningEffort: "none" })).rejects.toThrow();
    expect(await agent.connections("alice")).toEqual([expect.objectContaining({ details: expect.objectContaining({ model: "gpt-6-sol", reasoningEffort: "high", modelRevision: 1 }) })]);
  });
  it("rejects unsupported model-effort pairs while allowing the provider default", async () => {
    const { id } = await connect();
    const before = await agent.connections("alice");
    for (const [model, reasoningEffort] of [["gpt-6-luna", "none"], ["gpt-5.6-terra", "high"], ["provider-new-model", "low"], ["gpt-6-sol", "invented"]])
      await expect(agent.selectConnectionModel("alice", id, { ...input(), model, reasoningEffort })).rejects.toThrow();
    expect(await agent.connections("alice")).toEqual(before);
    expect(await agent.selectConnectionModel("alice", id, { ...input(), model: "provider-new-model", reasoningEffort: null }))
      .toMatchObject({ model: "provider-new-model", reasoningEffort: null });
  });
  it("keeps assessment model pins independent from interactive selection", async () => {
    const { id, device } = await connect();
    await agent.selectConnectionModel("alice", id, { ...input(), model: "gpt-5.6-sol", reasoningEffort: null });
    const request = await queueScreening(id);
    await agent.selectConnectionModel("alice", id, { ...input(), revision: 1, model: "gpt-6-luna", reasoningEffort: "high" });
    expect(await agent.claimDevice(device, id)).toMatchObject({ id: request.id, screening: true, model: "gpt-5.6-sol", reasoningEffort: null, screeningStage: "evidence", screeningSchema: screeningEvidenceSchema });
  });
  it("preserves saved effort choices across idempotent schema migration", async () => {
    const { id } = await connect();
    const request = await queue("alice", id);
    await db.query(`ALTER TABLE candidate_agent_requests DROP CONSTRAINT candidate_agent_requests_requested_reasoning_effort_check;
      ALTER TABLE candidate_agent_requests ADD CONSTRAINT candidate_agent_requests_requested_reasoning_effort_check CHECK (requested_reasoning_effort IS NULL OR requested_reasoning_effort='low')`);
    const [before] = await db.query("SELECT * FROM candidate_agent_requests WHERE id=$1", [request.id]);
    const migration = readFileSync("scripts/sql/candidate-model-selection.sql", "utf8");
    await db.query(migration);
    expect((await db.query("SELECT * FROM candidate_agent_requests WHERE id=$1", [request.id]))[0]).toEqual(before);
    await db.query("UPDATE candidate_agent_requests SET requested_reasoning_effort='high' WHERE id=$1", [request.id]);
    await db.query(migration);
    expect((await db.query("SELECT requested_reasoning_effort FROM candidate_agent_requests WHERE id=$1", [request.id]))[0]).toEqual({ requested_reasoning_effort: "high" });
    await expect(db.query("UPDATE candidate_agent_requests SET requested_reasoning_effort='invalid effort' WHERE id=$1", [request.id])).rejects.toThrow();
  });
  it("returns the same leased attempt to simultaneous claims without a second run", async () => {
    const { id, device } = await connect();
    const request = await queue("alice", id);
    const [first, second] = await Promise.all([agent.claimDevice(device, id), agent.claimDevice(device, id)]);
    expect(first).toMatchObject({ id: request.id, connectionId: id });
    expect(second).toEqual(first);
    expect(await db.query("SELECT id FROM candidate_agent_requests WHERE status='running'")).toEqual([{ id: request.id }]);
  });
  it("cancels pending work on disconnect and never lends another account's device", async () => {
    const alice = await connect(), bob = await connect("bob");
    const request = await queue("alice", alice.id);
    await agent.disconnect("alice", alice.id, input());
    await expect(agent.claimDevice(alice.device, alice.id)).rejects.toThrow();
    expect(await agent.claimDevice(bob.device, bob.id)).toBeNull();
    expect((await db.query("SELECT status FROM candidate_agent_requests WHERE id=$1", [request.id]))[0]).toEqual({ status: "cancelled" });
  });
});
