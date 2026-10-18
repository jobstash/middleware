import { ScreeningGovernanceService } from "./screening-governance.service";
import { randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { prepareMcpScreeningTestTables } from "src/mcp/mcp-test-fixture";
import { CareerRepository } from "./career.repository";
import { AgentService } from "./agent.service";
import { ScreeningService } from "./screening.service";
import { CandidateInvocationContext } from "./candidate-context";
import { createDeviceAgent, deviceConnectionFixture, claimDeviceFixture } from "./device-execution.fixture";
import { bindScreeningSourceFixture } from "./screening.fixture";
import { installCandidateGeographyFixture, saveCandidateGeographyFixture } from "./candidate-geographic-eligibility.fixture";

const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Candidate invocation authority (isolated PostgreSQL)", () => {
  let db: PostgresService, career: CareerRepository, agent: AgentService, screening: ScreeningService;
  let first: Extract<CandidateInvocationContext, { kind: "oauth" }>, second: typeof first;
  let connectionId: string;
  const key = randomBytes(32).toString("hex");
  const schema = `candidate_authority_${randomUUID().replace(/-/g, "")}`;
  const mutation = () => ({ requestId: randomUUID(), revision: 0 });
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/jobstash_mcp_test")
      throw new Error("Dedicated local jobstash_mcp_test database required");
    db = new PostgresService({ url: url!, applicationName: "candidate-authorization-tests", maxConnections: 12, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await prepareMcpScreeningTestTables(db);
    await installCandidateGeographyFixture(db);
    career = new CareerRepository(db);
    const config = new ConfigService({ CAREER_DATA_PROTECTION_KEY: key, CAREER_AGENT_CONCURRENCY: 4 });
    screening = new ScreeningService(db, career, config, new ScreeningGovernanceService(db, career));
    agent = createDeviceAgent(db, career, config, screening);
  });
  afterAll(async () => { if (db) { await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.onModuleDestroy(); } });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE candidate_screening_jobs,organization_search_documents,project_search_documents,candidate_cv_job_scores CASCADE");
    await db.query("TRUNCATE job_availability_extractions,job_work_location_options");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('alice-paid',1,'active',now()+interval '1 day')");
    const clientId = randomUUID();
    await db.query("INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,'Career app','[\"http://localhost/callback\"]')", [clientId]);
    first = { kind: "oauth", owner: "1", wallet: "alice", clientId, grantId: randomUUID(), scopes: ["career:read", "career:write"] };
    second = { ...first, grantId: randomUUID() };
    for (const context of [first, second])
      await db.query("INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at) VALUES($1,1,$2,'http://localhost/mcp','career:read career:write',now()+interval '1 day')", [context.grantId, clientId]);
    connectionId = randomUUID();
    await deviceConnectionFixture(db, "1", { id: connectionId });
  });

  async function save(context: CandidateInvocationContext, input = mutation(), text = "I build accessible interfaces.") {
    return career.withCandidateInvocation(context, "source_text_create", true,
      () => career.pasteCv(context.wallet, text, "CV", input));
  }
  async function queue(context = first) {
    return agent.runCandidate(context, { ...mutation(), connectionId, prompt: "Review my career directions" });
  }

  it("revalidates canonical owner, client and exact live scopes instead of trusting captured identity", async () => {
    await expect(career.authorizeCandidate({ ...first, owner: "2" })).rejects.toThrow("identity");
    await expect(career.authorizeCandidate({ ...first, wallet: "bob" })).rejects.toThrow("identity");
    await expect(career.authorizeCandidate({ ...first, clientId: randomUUID() })).rejects.toThrow("permissions");
    await db.query("UPDATE mcp_grants SET scope='career:read' WHERE id=$1", [first.grantId]);
    await expect(save(first)).rejects.toThrow("permissions");
    expect(await db.query("SELECT id FROM candidate_documents")).toEqual([]);
  });

  it("replays one owned result only for the same grant, channel, operation and input", async () => {
    const input = mutation();
    const saved = await save(first, input);
    expect(await save(first, input)).toEqual(saved);
    await expect(save(second, input)).rejects.toThrow("Request ID");
    await expect(save({ kind: "session", owner: "1", wallet: "alice" }, input)).rejects.toThrow("Request ID");
    await expect(save(first, input, "Different source")).rejects.toThrow("Request ID");
    await expect(career.withCandidateInvocation(first, "different_operation", true,
      () => career.pasteCv("alice", "I build accessible interfaces.", "CV", input))).rejects.toThrow("Request ID");
    expect(await db.query("SELECT id FROM candidate_documents")).toEqual([{ id: saved.id }]);
  });

  it("checks revocation and membership before returning a mutation receipt", async () => {
    const input = mutation();
    const source = await save(first, input);
    await db.query("UPDATE candidate_subscriptions SET status='expired' WHERE user_node_id=1");
    await expect(save(first, input)).rejects.toThrow("Advanced");
    expect(await career.withCandidateInvocation(first, "source_document_read", false,
      () => career.textDocument("alice", source.id))).toMatchObject({ text: "I build accessible interfaces." });
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [first.grantId]);
    await expect(career.withCandidateInvocation(first, "source_document_read", false,
      () => career.textDocument("alice", source.id))).rejects.toThrow("no longer connected");
  });

  it("rejects a grant revoked while a write waits for its canonical-owner transaction", async () => {
    let release!: () => void, locked!: () => void, entered!: () => void;
    const releaseGate = new Promise<void>(resolve => { release = resolve; });
    const lockedGate = new Promise<void>(resolve => { locked = resolve; });
    const enteredGate = new Promise<void>(resolve => { entered = resolve; });
    const holder = db.transaction(async executor => {
      await career.owner("alice", executor, true);
      locked();
      await releaseGate;
    });
    await lockedGate;
    const pending = career.withCandidateInvocation(first, "source_text_create", true, () => {
      entered();
      return career.pasteCv("alice", "Queued private source", "CV", mutation());
    });
    const rejected = expect(pending).rejects.toThrow("no longer connected");
    await enteredGate;
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [first.grantId]);
    release();
    await holder;
    await rejected;
    expect(await db.query("SELECT id FROM candidate_documents")).toEqual([]);
  });

  it("rechecks live authority immediately before commit and rolls back the attempted write", async () => {
    const input = mutation();
    await expect(career.withCandidateInvocation(first, "profile_update", true,
      () => career.mutate("alice", "profile-update", input, async executor => {
        await executor.query("UPDATE graph_nodes SET properties=properties || '{\"available\":true}' WHERE id=1");
        await executor.query("UPDATE mcp_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [first.grantId]);
        return { available: true };
      }))).rejects.toThrow("permissions");
    expect(await db.query("SELECT properties->'available' AS available FROM graph_nodes WHERE id=1")).toEqual([{ available: null }]);
    expect(await db.query("SELECT request_id FROM candidate_mutations WHERE request_id=$1", [input.requestId])).toEqual([]);
  });

  it("binds a queued request at creation and never claims revoked or reduced-scope work", async () => {
    const request = await queue();
    expect(await db.query("SELECT oauth_grant_id FROM candidate_agent_requests WHERE id=$1", [request.requestId])).toEqual([{ oauth_grant_id: first.grantId }]);
    await db.query("UPDATE mcp_grants SET scope='career:read' WHERE id=$1", [first.grantId]);
    expect(await claimDeviceFixture(db, agent, "alice", connectionId)).toBeNull();
    expect(await db.query("SELECT status FROM candidate_agent_requests WHERE id=$1", [request.requestId])).toEqual([{ status: "cancelled" }]);
  });

  it("denies revoked worker writes and event replay, while retaining session recovery of saved results", async () => {
    const request = await queue();
    const task = await claimDeviceFixture(db, agent, "alice", connectionId);
    expect(task).toMatchObject({ id: request.requestId });
    const workerId = String(task!.leaseId);
    const worker: CandidateInvocationContext = { kind: "worker", owner: "1", wallet: "alice", workerId, agentRequestId: String(request.requestId) };
    const input = mutation();
    const saved = await save(worker, input);
    const event = { type: "text", eventId: randomUUID(), text: "Saved source" };
    await agent.workerEvent(workerId, String(request.requestId), event);
    await expect(agent.candidateResult(second, String(request.requestId))).rejects.toThrow("not found");
    await expect(agent.candidateCancel(second, String(request.requestId), mutation())).rejects.toThrow("not found");
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [first.grantId]);
    await expect(save(worker, input)).rejects.toThrow("no longer connected");
    await expect(agent.workerEvent(workerId, String(request.requestId), event)).rejects.toThrow("no longer connected");
    await expect(agent.workerEvent(workerId, String(request.requestId), { type: "heartbeat" })).rejects.toThrow("no longer connected");
    await expect(agent.candidateResult(first, String(request.requestId))).rejects.toThrow("no longer connected");
    expect(await career.textDocument("alice", saved.id)).toMatchObject({ text: "I build accessible interfaces." });
    expect(await agent.candidateResult({ kind: "session", owner: "1", wallet: "alice" }, String(request.requestId))).toMatchObject({ events: [expect.objectContaining({ event: expect.objectContaining({ text: "Saved source" }) })] });
    await expect(agent.candidateResult({ kind: "session", owner: "2", wallet: "bob" }, String(request.requestId))).rejects.toThrow("not found");
  });

  it("preserves completed event idempotency but rejects it after grant revocation", async () => {
    const request = await queue();
    const workerId = String((await claimDeviceFixture(db, agent, "alice", connectionId))!.leaseId);
    const event = { type: "completed", eventId: randomUUID() };
    await agent.workerEvent(workerId, String(request.requestId), event);
    await agent.workerEvent(workerId, String(request.requestId), event);
    expect(await db.query("SELECT count(*)::int AS count FROM candidate_agent_events WHERE request_id=$1", [request.requestId])).toEqual([{ count: 1 }]);
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [first.grantId]);
    await expect(agent.workerEvent(workerId, String(request.requestId), event)).rejects.toThrow("no longer connected");
  });

  it("requires device lease recovery before domain writes and keeps research isolated", async () => {
    const request = await queue();
    const workerId = String((await claimDeviceFixture(db, agent, "alice", connectionId))!.leaseId);
    const [connection] = await db.query<{ device_id: string }>("SELECT device_id FROM candidate_ai_connections WHERE id=$1", [connectionId]);
    const device = { id: connection.device_id, owner: first.owner };
    const worker: CandidateInvocationContext = { kind: "worker", owner: "1", wallet: "alice", workerId, agentRequestId: String(request.requestId) };
    await db.query("UPDATE candidate_agent_requests SET heartbeat_at=now()-interval '46 seconds',lease_expires_at=now()-interval '1 second' WHERE id=$1", [request.requestId]);
    await expect(save(worker)).rejects.toThrow("no longer active");
    await expect(agent.deviceHeartbeat({ ...device, id: randomUUID() }, String(request.requestId), workerId)).rejects.toThrow("no longer active");
    await expect(agent.deviceHeartbeat(device, String(request.requestId), randomUUID())).rejects.toThrow("no longer active");
    await expect(save(worker)).rejects.toThrow("no longer active");
    expect(await agent.candidateResult(first, String(request.requestId))).toMatchObject({ status: "waiting_for_device" });
    const recovered = await claimDeviceFixture(db, agent, "alice", connectionId, String(request.requestId));
    expect(recovered).toMatchObject({ id: request.requestId, leaseId: workerId });
    await agent.deviceHeartbeat(device, String(request.requestId), workerId);
    expect(await agent.candidateResult(first, String(request.requestId))).toMatchObject({ status: "running" });
    const saved = await save(worker);
    expect(await career.textDocument("alice", saved.id)).toMatchObject({ text: "I build accessible interfaces." });
    await db.query("UPDATE candidate_agent_sessions SET object_kind='mcp_research' WHERE id=$1", [request.sessionId]);
    await expect(save(worker)).rejects.toThrow("no longer active");
    expect(await db.query("SELECT id FROM candidate_documents")).toEqual([{ id: saved.id }]);
  });

  async function screeningRun(context: CandidateInvocationContext = first) {
    const document = await save(first);
    await bindScreeningSourceFixture(db, document.id);
    await screening.savePreferences("alice", { currentLocation: "Berlin", relocation: "not_open" });
    await db.query("INSERT INTO candidate_career_profiles(user_node_id,directions) VALUES(1,ARRAY['Engineering'])");
    const [organization] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{\"orgId\":\"candidate-org\"}') RETURNING id");
    await db.query("INSERT INTO organization_search_documents(organization_node_id,organization_id,payload) VALUES($1,'candidate-org','{\"name\":\"Company\"}')", [organization.id]);
    const [job] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost','{}') RETURNING id");
    await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,title,organization_id,payload,filter_labels) VALUES($1,'candidate-job','Engineer','candidate-org','{}','{"classifications":{"engineering":"ENGINEERING"}}')`, [job.id]);
    const [ad] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('Jobpost','{\"content\":\"Build accessible interfaces.\"}') RETURNING id");
    await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_STRUCTURED_JOBPOST')", [ad.id, job.id]);
    await saveCandidateGeographyFixture(db, job.id, ad.id);
    const run = await career.withCandidateInvocation(context, "screening_start", true,
      () => screening.start("alice", document.id, connectionId, mutation()));
    return { id: String(run.id), documentId: document.id };
  }

  it.each(["oauth", "worker"] as const)("preserves %s origin authority through screening and denies revoked receipts", async kind => {
    let context: CandidateInvocationContext = first;
    if (kind === "worker") {
      const parent = await queue();
      const workerId = String((await claimDeviceFixture(db, agent, "alice", connectionId))!.leaseId);
      context = { kind: "worker", owner: "1", wallet: "alice", workerId, agentRequestId: String(parent.requestId) };
    }
    const run = await screeningRun(context);
    expect(await db.query("SELECT oauth_grant_id FROM candidate_screening_runs WHERE id=$1", [run.id])).toEqual([{ oauth_grant_id: first.grantId }]);
    if (context.kind === "worker")
      await agent.workerEvent(context.workerId, context.agentRequestId, { type: "completed", eventId: randomUUID() });
    await db.transaction(executor => screening.enqueue(executor));
    const [request] = await db.query("SELECT a.id,a.oauth_grant_id FROM candidate_agent_requests a JOIN candidate_screening_jobs j ON j.request_id=a.id WHERE j.run_id=$1", [run.id]);
    expect(request.oauth_grant_id).toBe(first.grantId);
    const task = await claimDeviceFixture(db, agent, "alice", connectionId);
    expect(task).toMatchObject({ id: request.id, screening: true });
    const workerId = String(task!.leaseId);
    expect(await screening.receipt(workerId, String(request.id))).toMatchObject({ persisted: false });
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [first.grantId]);
    await expect(screening.receipt(workerId, String(request.id))).rejects.toThrow("no longer connected");
    await expect(screening.persist(workerId, String(request.id), {})).rejects.toThrow("no longer connected");
    await db.transaction(executor => screening.enqueue(executor));
    expect(await db.query("SELECT status FROM candidate_screening_runs WHERE id=$1", [run.id])).toEqual([{ status: "paused" }]);
  });

  it("does not let another grant's worker control a screening run", async () => {
    const run = await screeningRun();
    const request = await queue(second);
    const workerId = String((await claimDeviceFixture(db, agent, "alice", connectionId))!.leaseId);
    const context: CandidateInvocationContext = { kind: "worker", owner: "1", wallet: "alice", workerId, agentRequestId: String(request.requestId) };
    await expect(career.withCandidateInvocation(context, "screening_control", true,
      () => screening.control("alice", run.id, "pause", mutation()))).rejects.toThrow("not found");
    expect(await db.query("SELECT status FROM candidate_screening_runs WHERE id=$1", [run.id])).toEqual([{ status: "running" }]);
  });

  it("pauses unfinished screening after accumulated directions or source changes without overwriting saved assessments", async () => {
    const run = await screeningRun();
    await db.query("UPDATE candidate_screening_jobs SET assessment='{\"recommendation\":\"interview\"}',status='completed' WHERE run_id=$1", [run.id]);
    await db.query("UPDATE candidate_career_profiles SET revision=revision+1,directions=ARRAY['Design'] WHERE user_node_id=1");
    await db.transaction(executor => screening.enqueue(executor));
    expect(await db.query("SELECT status FROM candidate_screening_runs WHERE id=$1", [run.id])).toEqual([{ status: "paused" }]);
    expect(await db.query("SELECT assessment FROM candidate_screening_jobs WHERE run_id=$1", [run.id])).toEqual([{ assessment: { recommendation: "interview" } }]);
    await db.query("UPDATE candidate_documents SET source_text='Changed source' WHERE id=$1", [run.documentId]);
    await expect(screening.control("alice", run.id, "resume", mutation())).rejects.toThrow("source changed");
    expect(JSON.parse(await screening.candidateContext("1"))).toMatchObject({ career: { revision: 1, directions: ["Design"] } });
  });
});
