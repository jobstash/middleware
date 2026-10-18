/// <reference lib="es2024.promise" />
import { ConfigService } from "@nestjs/config";
import { createHash, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
import { DeviceExecutionService } from "./device-execution.service";
import { ApplicationService } from "./application.service";
import { BrowserApplicationService } from "./browser-application.service";
import { BrowserAction, BrowserObservation, BrowserRunView, browserCanonicalJson, browserDestination, browserHash, emptyBrowserAction, validateBrowserObservation } from "./browser-application.protocol";
import { BrowserStepInput } from "./browser-application.dto";
import { CareerRepository } from "./career.repository";
import { applyCvBaselineChanges, buildCvBaseline } from "./cv-source-baseline";

const databaseUrl = process.env.CAREER_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("Browser application durable protocol (isolated PostgreSQL schema)", () => {
  let admin: PostgresService, db: PostgresService, service: BrowserApplicationService;
  let nextAction: BrowserAction, run: BrowserRunView, sourceId: string, connectionId: string, documentId: string, applicationId: string;
  const schema = `browser_test_${randomUUID().replace(/-/g, "")}`, clientId = randomUUID();
  const deviceId = randomUUID(), keys = generateKeyPairSync("ed25519");
  function receipt(kind: "plan" | "approval", payload: Record<string, unknown>) {
    const body: Record<string, unknown> = { runId: run.id, packetHash: run.packetHash, issuedAt: Date.now(), expiresAt: Date.now() + 90000, ...payload };
    return { deviceId, payload: body, signature: sign(null, Buffer.from(`recruiters.browser.${kind}.v1\n${browserCanonicalJson(body)}`), keys.privateKey).toString("base64url") };
  }
  function approvalInput() {
    return { requestId: randomUUID(), commandId: run.command!.id, observationHash: run.command!.observationHash,
      receipt: receipt("approval", { commandId: run.command!.id, sequence: run.command!.sequence, action: run.command!.action,
        observationHash: run.command!.observationHash, metadataHash: browserHash(run.metadata),
        allowedOrigins: run.pendingOrigin ? [...run.allowedOrigins, run.pendingOrigin] : run.allowedOrigins,
        formIdentityHash: run.command!.action.kind === "submit" ? "f".repeat(64) : null }) };
  }
  function observation(text = "Apply for this role"): BrowserObservation {
    return { url: "https://jobs.acme.com/apply", title: "Apply", text, visible: true, timezone: "Europe/London",
      viewport: { width: 128, height: 128, deviceScaleFactor: 1 },
      elements: [{ ref: "submit", kind: "button", label: "Submit application", value: null, options: [], href: null, required: false }] };
  }
  function step(extra: Partial<BrowserStepInput> = {}): BrowserStepInput {
    const input = { eventId: randomUUID(), clientId, token: run.clientToken, sequence: run.sequence, observation: observation(), ...extra };
    return { ...input, ...(input.observation ? { proposal: receipt("plan", { sequence: input.sequence, connectionId, connectionGeneration: 0,
      model: "gpt-6-sol", reasoningEffort: "low", observationHash: browserHash(input.observation), action: nextAction }) } : {}) };
  }
  function returns(action: BrowserAction) {
    nextAction = action;
  }
  async function submitApproval() {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    run = await service.step("alice", run.id, step());
    const approval = approvalInput();
    run = await service.approve("alice", run.id, approval);
    return approval;
  }
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !["/career_agent_test", "/jobstash_hosted_career_test"].includes(url.pathname)) throw Error("Dedicated local career test database required");
    const options = { url: databaseUrl!, applicationName: "browser-application-tests", maxConnections: 4, statementTimeoutMs: 10000 };
    admin = new PostgresService(options); await admin.onModuleInit(); await admin.query(`CREATE SCHEMA ${schema}`);
    db = new PostgresService(options);
    db.getDataSource().setOptions({ extra: { max: 4, options: `-c search_path=${schema} -c jit=off` } }); await db.onModuleInit();
    await db.query(`CREATE TABLE graph_nodes(id bigint PRIMARY KEY,label text,properties jsonb);
      INSERT INTO graph_nodes VALUES(1,'User','{"wallet":"alice"}'),(2,'User','{"wallet":"bob"}');
      CREATE TABLE candidate_applications(id uuid PRIMARY KEY,user_node_id bigint,job_node_id bigint,short_uuid text,job_snapshot jsonb,state jsonb,revision integer DEFAULT 0,updated_at timestamptz DEFAULT now());
      CREATE TABLE candidate_application_documents(id uuid PRIMARY KEY,user_node_id bigint,application_id uuid,revision integer,content jsonb,cv_version_id uuid);
      CREATE TABLE candidate_cv_versions(id uuid PRIMARY KEY,user_node_id bigint,revision integer,heading jsonb,updated_at timestamptz DEFAULT now());
      CREATE TABLE candidate_documents(id uuid PRIMARY KEY,user_node_id bigint,content_hash text,source_text text,parsed_result jsonb,extraction_provenance jsonb);
      CREATE TABLE candidate_career_profiles(user_node_id bigint,evidence jsonb);
      CREATE TABLE user_job_preferences(user_node_id bigint);
      CREATE TABLE job_search_documents(job_node_id bigint,payload jsonb,online boolean,blocked boolean);
      CREATE TABLE candidate_ai_connections(id uuid PRIMARY KEY,user_node_id bigint,status text,provider text,generation integer,public_state jsonb);
      CREATE TABLE candidate_subscriptions(charge_id text,user_node_id bigint,status text,paid_until timestamptz);
      INSERT INTO candidate_subscriptions VALUES('alice',1,'active',now()+interval '1 day'),('bob',2,'active',now()+interval '1 day');
      CREATE TABLE candidate_exports(id uuid,user_node_id bigint,document_id uuid,document_revision integer,kind text,filename text,bytes bytea,provenance jsonb,created_at timestamptz DEFAULT now());`);
    await db.query(readFileSync("scripts/sql/candidate-browser-applications.sql", "utf8"));
    const career = new CareerRepository(db);
    const devices = { verifyOwnedReceipt: async (owner: string, id: string, domain: string, payload: unknown, signature: string) => {
      if (String(owner) !== "1" || id !== deviceId || !verify(null, Buffer.from(`${domain}\n${browserCanonicalJson(payload)}`), keys.publicKey, Buffer.from(signature, "base64url"))) throw new Error("Invalid device signature");
    } } as unknown as DeviceExecutionService;
    service = new BrowserApplicationService(db, career, new ApplicationService(db, career), devices, new ConfigService());
  });
  afterAll(async () => { if (db) await db.onModuleDestroy(); if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.onModuleDestroy(); } });
  beforeEach(async () => {
    nextAction = emptyBrowserAction("observe"); sourceId = randomUUID(); connectionId = randomUUID(); documentId = randomUUID(); applicationId = randomUUID();
    const content = { title: "Engineer", applyUrl: "https://jobs.acme.com/apply",
      sections: [{ kind: "letter", text: "Prepared cover letter. ".repeat(220) }],
      cvBaseline: applyCvBaselineChanges(buildCvBaseline({ id: sourceId, contentHash: "source", sourceText: "Alice Engineer" }), []) };
    await db.query("INSERT INTO candidate_documents VALUES($1,1,'source','Alice Engineer',NULL,NULL)", [sourceId]);
    await db.query("INSERT INTO candidate_applications(id,user_node_id,short_uuid,job_snapshot,state) VALUES($1,1,'local-job','{}','{\"status\":\"preparing\"}')", [applicationId]);
    await db.query("INSERT INTO candidate_cv_versions(id,user_node_id,revision,heading) VALUES($1,1,1,'{\"name\":\"Alice\"}')", [documentId]);
    await db.query("INSERT INTO candidate_application_documents VALUES($1,1,$2,1,$3,$1)", [documentId, applicationId, JSON.stringify(content)]);
    await db.query("INSERT INTO candidate_ai_connections VALUES($1,1,'connected','openai',0,$2)", [connectionId, JSON.stringify({ execution: "device", deviceId, model: "gpt-6-sol", reasoningEffort: "low" })]);
    const [saved] = await db.query("SELECT d.content,to_jsonb(cv)-'created_at'-'updated_at' AS cv FROM candidate_application_documents d JOIN candidate_cv_versions cv ON cv.id=d.cv_version_id WHERE d.id=$1", [documentId]);
    run = { id: randomUUID(), status: "ready", documentId, applicationId, revision: 1, shortUUID: "local-job", title: "Engineer", company: null,
      applyUrl: "https://jobs.acme.com/apply", allowedOrigins: ["https://jobs.acme.com"], clientToken: randomUUID(), sequence: 0,
      packetHash: "", deviceId, connectionId, connectionGeneration: 0, model: "gpt-6-sol", reasoningEffort: "low",
      metadata: { name: "Alice", email: "alice@example.invalid" }, artifacts: [], command: null, question: null, message: null, receipt: null };
    const details = { documentId, revision: 1, applicationId, shortUUID: "local-job", title: "Engineer", company: null, applyUrl: run.applyUrl, sourceDocumentId: sourceId };
    const state = { view: run, packetHash: browserHash([documentId, 1, saved.content, sourceId, "source", "Alice Engineer", null, null,
      { coverLetter: content.sections[0].text }, [], details, saved.cv]),
      connectionId, connectionGeneration: 0, model: "gpt-6-sol", reasoningEffort: "low", clientId: null, attempts: 0,
      submitApproved: false, submitAcknowledged: false, observationHash: "", lastObservation: null };
    run.packetHash = state.packetHash;
    await db.query("INSERT INTO candidate_browser_applications VALUES($1,1,$2,$3,$4,'start','ready',$5,now(),now())", [run.id, applicationId, documentId, randomUUID(), JSON.stringify(state)]);
  });
  it("isolates source, run, approvals and artifact access by session owner", async () => {
    await expect(service.prepare("bob", documentId)).rejects.toThrow("Owned application");
    await expect(service.status("bob", run.id)).rejects.toThrow("not found");
    await expect(service.step("bob", run.id, step())).rejects.toThrow("not found");
    await expect(service.approve("bob", run.id, { requestId: randomUUID(), commandId: randomUUID(), observationHash: "a".repeat(64), receipt: receipt("approval", {}) })).rejects.toThrow("not found");
    await expect(service.artifact("bob", run.id, randomUUID())).rejects.toThrow("not found");
  });
  it("replays an accepted device proposal durably and rejects changed replay payloads", async () => {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" }); const input = step();
    const first = await service.step("alice", run.id, input);
    expect(first.status).toBe("awaiting_approval"); expect(first.command!.approved).toBe(false);
    expect(await service.step("alice", run.id, input)).toEqual(first);
    await expect(service.step("alice", run.id, { ...input, observation: observation("Changed page") })).rejects.toThrow("identity changed");
  });
  it("does not replay an approved command after cancellation", async () => {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    const observationInput = step();
    run = await service.step("alice", run.id, observationInput);
    const approval = approvalInput();
    run = await service.approve("alice", run.id, approval);
    expect(run.command!.approved).toBe(true);
    const cancelled = await service.control("alice", run.id, { requestId: randomUUID(), action: "cancel" });
    expect(await service.approve("alice", run.id, approval)).toEqual(cancelled);
    expect(await service.step("alice", run.id, observationInput)).toEqual(cancelled);
    expect(cancelled).toMatchObject({ status: "cancelled", command: null });
  });
  it("rejects a superseded event instead of issuing either its old command or the new one", async () => {
    returns(emptyBrowserAction("observe"));
    const first = step();
    run = await service.step("alice", run.id, first);
    const firstCommandId = run.command!.id;
    run = await service.step("alice", run.id, step({ result: { commandId: firstCommandId, status: "ok", submitted: false, message: null } }));
    expect(run.command!.id).not.toBe(firstCommandId);
    await expect(service.step("alice", run.id, first)).rejects.toThrow("superseded");
    expect((await service.status("alice", run.id)).command).toEqual(run.command);
  });
  it.each(["packet", "revocation", "generation", "device"] as const)("revokes cached approval when the %s pin changes", async pin => {
    const approval = await submitApproval();
    if (pin === "packet") await db.query("UPDATE candidate_application_documents SET revision=revision+1 WHERE id=$1", [documentId]);
    else if (pin === "revocation") await db.query("UPDATE candidate_ai_connections SET status='disconnected' WHERE id=$1", [connectionId]);
    else if (pin === "generation") await db.query("UPDATE candidate_ai_connections SET generation=generation+1 WHERE id=$1", [connectionId]);
    else await db.query("UPDATE candidate_ai_connections SET public_state=jsonb_set(public_state,'{deviceId}',$2::jsonb) WHERE id=$1", [connectionId, JSON.stringify(randomUUID())]);
    await expect(service.status("alice", run.id)).rejects.toThrow();
    const revoked = await service.approve("alice", run.id, approval);
    expect(revoked).toMatchObject({ status: "uncertain", command: null, question: { kind: "handoff" } });
    expect(await service.approve("alice", run.id, approval)).toEqual(revoked);
    expect(await service.status("alice", run.id)).toEqual(revoked);
  });
  it.each(["model", "reasoningEffort"] as const)("continues the frozen run after changing the current %s preference", async preference => {
    returns(emptyBrowserAction("observe"));
    run = await service.step("alice", run.id, step());
    await db.query("UPDATE candidate_ai_connections SET public_state=jsonb_set(public_state,$2::text[],$3::jsonb) WHERE id=$1",
      [connectionId, [preference], JSON.stringify(preference === "model" ? "different-model" : "high")]);
    expect(await service.status("alice", run.id)).toMatchObject({ model: "gpt-6-sol", reasoningEffort: "low", command: { approved: true } });
    run = await service.step("alice", run.id, step({ result: { commandId: run.command!.id, status: "ok", submitted: false, message: null } }));
    expect(run).toMatchObject({ status: "running", model: "gpt-6-sol", reasoningEffort: "low", command: { approved: true, action: { kind: "observe" } } });
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    run = await service.step("alice", run.id, step({ result: { commandId: run.command!.id, status: "ok", submitted: false, message: null } }));
    const approval = approvalInput();
    run = await service.approve("alice", run.id, approval);
    expect(await service.approve("alice", run.id, approval)).toMatchObject({ model: "gpt-6-sol", reasoningEffort: "low", command: { approved: true, action: { kind: "submit" } } });
  });
  it("revalidates cached non-submit commands after connection revocation", async () => {
    returns(emptyBrowserAction("observe"));
    const input = step();
    run = await service.step("alice", run.id, input);
    await db.query("UPDATE candidate_ai_connections SET status='disconnected' WHERE id=$1", [connectionId]);
    expect(await service.step("alice", run.id, input)).toMatchObject({ status: "needs_user", command: null });
  });
  it("revalidates executable commands returned by a repeated start request", async () => {
    await submitApproval();
    const input = { requestId: randomUUID(), documentId, revision: 1, connectionId, model: "gpt-6-sol", reasoningEffort: "low",
      metadata: run.metadata, consent: { browserControl: true as const, dataTransfer: true as const } };
    await db.query("UPDATE candidate_browser_applications SET start_request_id=$2,start_hash=$3 WHERE id=$1", [run.id, input.requestId, browserHash(input)]);
    await db.query("UPDATE candidate_ai_connections SET status='disconnected' WHERE id=$1", [connectionId]);
    expect(await service.start("alice", input)).toMatchObject({ status: "uncertain", command: null });
  });
  it("requires the exact observation approval and never repeats an interrupted approved submit", async () => {
    await submitApproval();
    await expect(service.approve("alice", run.id, { ...approvalInput(), observationHash: "0".repeat(64) })).rejects.toThrow("Approval");
    run = await service.control("alice", run.id, { requestId: randomUUID(), action: "pause" });
    run = await service.control("alice", run.id, { requestId: randomUUID(), action: "resume" });
    expect(run).toMatchObject({ status: "uncertain", command: null });
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    run = await service.step("alice", run.id, step());
    expect(run).toMatchObject({ status: "uncertain", command: null, receipt: null });
    expect((await db.query("SELECT state->>'status' AS status FROM candidate_applications WHERE id=$1", [applicationId]))[0].status).toBe("preparing");
  });
  it("invalidates approval when the original source changes", async () => {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" }); run = await service.step("alice", run.id, step());
    await db.query("UPDATE candidate_documents SET source_text='Changed source' WHERE id=$1", [sourceId]);
    await expect(service.approve("alice", run.id, approvalInput())).rejects.toThrow("source CV changed");
    expect((await service.status("alice", run.id)).command!.approved).toBe(false);
  });
  it("pins mutable CV content but ignores timestamp-only bookkeeping", async () => {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    await db.query("UPDATE candidate_cv_versions SET updated_at=now()+interval '1 second' WHERE id=$1", [documentId]);
    run = await service.step("alice", run.id, step());
    expect(run.status).toBe("awaiting_approval");
    await db.query("UPDATE candidate_cv_versions SET heading='{\"name\":\"Changed candidate\"}' WHERE id=$1", [documentId]);
    await expect(service.approve("alice", run.id, approvalInput())).rejects.toThrow("packet or source changed");
  });
  it("rejects a caller replacing the prepared cover letter independently of its packet revision", async () => {
    const textHash = createHash("md5").update("Alice Engineer").digest("hex");
    await db.query("UPDATE candidate_documents SET parsed_result=$2 WHERE id=$1", [sourceId, JSON.stringify({
      matchingContext: { version: 4, contentHash: "source", sourceTextHash: textHash, projectionText: "Alice Engineer", projectionHash: textHash, sourceProvenance: null },
    })]);
    const prepared = await service.prepare("alice", documentId);
    await expect(service.start("alice", {
      requestId: randomUUID(), documentId, revision: 1, connectionId, model: "gpt-6-sol", reasoningEffort: "low",
      metadata: { ...prepared.metadata, name: "Alice", email: "alice@example.invalid", coverLetter: "A different letter" },
      consent: { browserControl: true, dataTransfer: true },
    })).rejects.toThrow("Edit the prepared application packet");
  });
  it("requires both acknowledged approved submission and a confirmation in the real observation", async () => {
    returns({ ...emptyBrowserAction("finish"), confirmation: "Your application was received" });
    run = await service.step("alice", run.id, step({ observation: observation("Your application was received") }));
    expect(run.receipt).toBeNull();
    run = await service.control("alice", run.id, { requestId: randomUUID(), action: "resume" });
    await submitApproval();
    returns({ ...emptyBrowserAction("finish"), confirmation: "Your application was received" });
    run = await service.step("alice", run.id, step({ result: { commandId: run.command!.id, status: "ok", submitted: true, message: null } }));
    expect(run).toMatchObject({ status: "uncertain", receipt: null });
    run = await service.control("alice", run.id, { requestId: randomUUID(), action: "resume" });
    run = await service.step("alice", run.id, step({ observation: observation("Your application was received") }));
    expect(run.status).toBe("submitted"); expect(run.receipt!.confirmation).toBe("Your application was received");
    const [tracked] = await db.query("SELECT state FROM candidate_applications WHERE id=$1", [applicationId]);
    expect(tracked.state).toMatchObject({ status: "applied", applicationSource: "browser_observed", browserReceipt: { source: "browser_observed", runId: run.id } });
  });
  it("preserves explicit manual tracker outcomes on an observed receipt", async () => {
    await db.query("UPDATE candidate_applications SET state='{\"status\":\"interview\"}' WHERE id=$1", [applicationId]);
    await submitApproval(); returns({ ...emptyBrowserAction("finish"), confirmation: "Your application was received" });
    run = await service.step("alice", run.id, step({ observation: observation("Your application was received"), result: { commandId: run.command!.id, status: "ok", submitted: true, message: null } }));
    expect(run.status).toBe("submitted");
    expect((await db.query("SELECT state->>'status' AS status FROM candidate_applications WHERE id=$1", [applicationId]))[0].status).toBe("interview");
  });
  it("keeps a completed receipt readable after source and account pins change", async () => {
    const approval = await submitApproval();
    returns({ ...emptyBrowserAction("finish"), confirmation: "Your application was received" });
    const receiptInput = step({ observation: observation("Your application was received"), result: { commandId: run.command!.id, status: "ok", submitted: true, message: null } });
    const completed = await service.step("alice", run.id, receiptInput);
    expect(completed).toMatchObject({ status: "submitted", command: null, receipt: { confirmation: "Your application was received" } });
    await db.query("UPDATE candidate_documents SET source_text='Changed source' WHERE id=$1", [sourceId]);
    await db.query("UPDATE candidate_ai_connections SET status='disconnected' WHERE id=$1", [connectionId]);
    expect(await service.status("alice", run.id)).toEqual(completed);
    expect(await service.step("alice", run.id, receiptInput)).toEqual(completed);
    expect(await service.approve("alice", run.id, approval)).toEqual(completed);
  });
  it("pauses new origins and rejects unsolicited page contents", async () => {
    await expect(service.step("alice", run.id, step({ observation: { ...observation(), url: "https://other.acme.com/apply" } }))).rejects.toThrow("metadata-only");
    run = await service.step("alice", run.id, step({ observation: undefined, interruption: { reason: "origin_changed", url: "https://other.acme.com/apply", commandId: null, submitted: false } }));
    expect(run.status).toBe("awaiting_approval"); expect(run.allowedOrigins).not.toContain("https://other.acme.com");
    run = await service.approve("alice", run.id, approvalInput());
    expect(run.allowedOrigins).toContain("https://other.acme.com");
  });
  it("approves a held cross-origin transfer without navigating to the upload endpoint", async () => {
    await expect(service.step("alice", run.id, step({ observation: undefined, interruption: {
      reason: "origin_changed", scope: "network", url: "https://uploads.acme.com/path?signature=secret", commandId: null, submitted: false,
    } }))).rejects.toThrow("only the destination origin");
    run = await service.step("alice", run.id, step({ observation: undefined, interruption: {
      reason: "origin_changed", scope: "network", url: "https://uploads.acme.com", commandId: null, submitted: false,
    } }));
    expect(run.command).toMatchObject({ approved: false, action: { kind: "observe", url: null } });
    run = await service.approve("alice", run.id, approvalInput());
    expect(run.command).toMatchObject({ approved: true, action: { kind: "observe", url: null } });
    expect(run.allowedOrigins).toContain("https://uploads.acme.com");
  });
  it("retires a submit blocked by form preflight and requires fresh approval after destination consent", async () => {
    const originalApproval = await submitApproval();
    run = await service.step("alice", run.id, step({ observation: undefined, interruption: {
      reason: "origin_changed", scope: "network", url: "https://forms.acme.com", commandId: run.command!.id, submitted: false, submitAttempted: false,
    } }));
    expect(run).toMatchObject({ status: "awaiting_approval", command: { approved: false, action: { kind: "observe", url: null } } });
    await expect(service.approve("alice", run.id, originalApproval)).rejects.toThrow("superseded");
    run = await service.approve("alice", run.id, approvalInput());
    expect(run.allowedOrigins).toContain("https://forms.acme.com");
    expect(run.command).toMatchObject({ approved: true, action: { kind: "observe", url: null } });
    run = await service.step("alice", run.id, step({ result: { commandId: run.command!.id, status: "ok", submitted: false, message: null } }));
    expect(run).toMatchObject({ status: "awaiting_approval", command: { approved: false, action: { kind: "submit" } } });
    expect(run.command!.id).not.toBe(originalApproval.commandId);
    run = await service.approve("alice", run.id, approvalInput());
    expect(run.command).toMatchObject({ approved: true, action: { kind: "submit" } });
  });
  it.each([undefined, true])("does not retry a cross-origin submit when its attempt state is %s", async submitAttempted => {
    await submitApproval();
    run = await service.step("alice", run.id, step({ observation: undefined, interruption: {
      reason: "origin_changed", scope: "network", url: "https://forms.acme.com", commandId: run.command!.id, submitted: false, submitAttempted,
    } }));
    expect(run).toMatchObject({ status: "uncertain", command: null, question: { kind: "handoff" } });
    expect(run.allowedOrigins).not.toContain("https://forms.acme.com");
  });
  it("rejects action authority when the funded connection is revoked", async () => {
    await db.query("UPDATE candidate_ai_connections SET status='disconnected' WHERE id=$1", [connectionId]);
    run = await service.step("alice", run.id, step());
    expect(run).toMatchObject({ status: "needs_user", command: null });
  });
  it("downloads only run-approved frozen bytes and rejects altered exports", async () => {
    const id = randomUUID(), bytes = Buffer.from("%PDF-test-frozen-artifact");
    await db.query("INSERT INTO candidate_exports(id,user_node_id,document_id,document_revision,kind,filename,bytes,provenance) VALUES($1,1,$2,1,'cv','application-cv.pdf',$3,'{}')", [id, documentId, bytes]);
    const artifact = { id, kind: "cv", filename: "application-cv.pdf", sha256: browserHash(bytes), byteLength: bytes.length, contentType: "application/pdf", downloadPath: `/profile/browser-applications/${run.id}/artifacts/${id}` };
    await db.query("UPDATE candidate_browser_applications SET state=jsonb_set(state,'{view,artifacts}',$2) WHERE id=$1", [run.id, JSON.stringify([artifact])]);
    expect((await service.artifact("alice", run.id, id)).bytes).toEqual(bytes);
    await expect(service.artifact("alice", run.id, randomUUID())).rejects.toThrow("not approved");
    await db.query("UPDATE candidate_exports SET bytes=$2 WHERE id=$1", [id, Buffer.from("changed")]);
    await expect(service.artifact("alice", run.id, id)).rejects.toThrow("integrity");
  });
  it("rejects missing device authority and a signature copied onto a different action", async () => {
    const input = step();
    await expect(service.step("alice", run.id, { ...input, proposal: undefined })).rejects.toThrow("paired device");
    input.proposal!.payload.action = { ...emptyBrowserAction("submit"), ref: "submit" };
    await expect(service.step("alice", run.id, input)).rejects.toThrow("signature");
    expect(await service.status("alice", run.id)).toMatchObject({ status: "ready", command: null, sequence: 0 });
  });
  it.each(["sequence", "observationHash", "connectionGeneration", "model", "packetHash"] as const)("rejects a validly signed proposal with the wrong %s pin", async field => {
    const input = step(), payload = { ...input.proposal!.payload };
    payload[field] = typeof payload[field] === "number" ? Number(payload[field]) + 1 : "changed";
    input.proposal = receipt("plan", payload);
    await expect(service.step("alice", run.id, input)).rejects.toThrow();
    expect((await service.status("alice", run.id)).command).toBeNull();
  });
  it("does not accept website approval without an independently signed exact native receipt", async () => {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    run = await service.step("alice", run.id, step());
    const input = approvalInput();
    input.receipt.payload.metadataHash = "0".repeat(64);
    await expect(service.approve("alice", run.id, input)).rejects.toThrow("signature");
    expect((await service.status("alice", run.id)).command!.approved).toBe(false);
  });
  it("retires an unapproved submit blocked before the native approval gesture", async () => {
    returns({ ...emptyBrowserAction("submit"), ref: "submit" });
    run = await service.step("alice", run.id, step());
    run = await service.step("alice", run.id, step({ observation: undefined, interruption: {
      reason: "origin_changed", scope: "network", url: "https://forms.acme.com", commandId: run.command!.id, submitted: false, submitAttempted: false,
    } }));
    expect(run).toMatchObject({ status: "awaiting_approval", pendingOrigin: "https://forms.acme.com", command: { approved: false, action: { kind: "observe" } } });
    expect(run.allowedOrigins).not.toContain("https://forms.acme.com");
  });
});

describe("Browser destination boundary", () => {
  it.each(["http://jobs.acme.com", "https://127.0.0.1", "https://2130706433", "https://[::1]", "https://10.0.0.1", "https://internal", "https://foo.local", "https://user:password@jobs.acme.com", "file:///tmp/cv.pdf", "javascript:alert(1)"])("rejects %s", url => {
    expect(() => browserDestination(url)).toThrow();
  });
  it("allows only the explicitly configured local fixture origin", () => {
    expect(browserDestination("http://127.0.0.1:9999/apply", "http://127.0.0.1:9999").origin).toBe("http://127.0.0.1:9999");
    expect(() => browserDestination("http://127.0.0.1:9998/apply", "http://127.0.0.1:9999")).toThrow();
  });
});

describe("Browser observation bounds", () => {
  it("accepts a full 300-option select but rejects the next option and an oversized href", () => {
    const observation: BrowserObservation = { url: "https://jobs.acme.com/apply", title: "Application", text: "Country",
      visible: true, timezone: "Europe/London", viewport: { width: 128, height: 128, deviceScaleFactor: 1 },
      elements: [{ ref: "country", kind: "select", label: "Country", value: null, required: true, href: "h".repeat(2048),
        options: Array.from({ length: 300 }, (_, index) => ({ value: String(index), label: `Country ${index}` })) }] };
    expect(() => validateBrowserObservation(observation)).not.toThrow();
    observation.elements[0].options.push({ value: "300", label: "Country 300" });
    expect(() => validateBrowserObservation(observation)).toThrow("Invalid visible browser element");
    observation.elements[0].options.pop();
    observation.elements[0].href += "h";
    expect(() => validateBrowserObservation(observation)).toThrow("Invalid visible browser element");
    observation.elements[0].href = null;
    expect(() => validateBrowserObservation({ ...observation, screenshot: "provider-only-image" })).toThrow();
  });
});
