import { ScreeningGovernanceService } from "./screening-governance.service";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileRepository } from "src/postgres/profile.repository";
import { ProfileService } from "src/auth/profile/profile.service";
import { CareerRepository } from "./career.repository";
import { ApplicationService } from "./application.service";
import { AgentService } from "./agent.service";
import { ScreeningService } from "./screening.service";
import { SubscriptionService } from "./subscription.service";
import { VoiceConnectionService } from "./voice-connection.service";
import { CandidateSetupService } from "./candidate-setup.service";
import { CandidateCapabilityService } from "./candidate-capabilities.service";
import { CandidateInvocationContext, CandidateScope } from "./candidate-context";
import { CareerToolService } from "./career-tools.service";
import { CandidateMatchingService } from "./candidate-matching.service";
import { bindScreeningSourceFixture } from "./screening.fixture";
import { installCandidateGeographyFixture, saveCandidateGeographyFixture } from "./candidate-geographic-eligibility.fixture";
import { createDeviceAgent, deviceConnectionFixture, leaseDeviceRequestFixture } from "./device-execution.fixture";
import { CandidateDocumentsService } from "./candidate-documents.service";
import { CandidateDocumentCodec } from "./candidate-document-codec";
import { unknownDocumentProvenance } from "./candidate-document-provenance";

const databaseUrl = process.env.CAREER_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("Authorized candidate capabilities (isolated PostgreSQL)", () => {
  let db: PostgresService, career: CareerRepository, applications: ApplicationService;
  let capabilities: CandidateCapabilityService, tools: CareerToolService, agent: AgentService;
  let alice: CandidateInvocationContext, bob: CandidateInvocationContext;
  const config = new ConfigService({ RECRUITERS_PUBLIC_ORIGIN: "http://127.0.0.1:3001", CAREER_DATA_PROTECTION_KEY: "22".repeat(32) });
  const mutation = () => ({ requestId: randomUUID(), revision: 0 });
  const schema = `capabilities_${randomUUID().replace(/-/g, "")}`;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || !["/career_agent_test", "/jobstash_hosted_career_test"].includes(url.pathname))
      throw new Error("Dedicated local career test database required");
    db = new PostgresService({ url: databaseUrl!, applicationName: "candidate-capability-tests", maxConnections: 12, statementTimeoutMs: 10000 });
    const dataSource = db.getDataSource();
    dataSource.setOptions({ extra: { ...dataSource.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS graph_nodes(id bigserial PRIMARY KEY,label text NOT NULL,properties jsonb NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS graph_relationships(id bigserial PRIMARY KEY,source_id bigint REFERENCES graph_nodes(id),target_id bigint REFERENCES graph_nodes(id),type text,relationship_key text,properties jsonb,UNIQUE(source_id,target_id,type,relationship_key));
      CREATE TABLE IF NOT EXISTS job_search_documents(job_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),short_uuid text UNIQUE,payload jsonb,filter_labels jsonb);
      CREATE TABLE IF NOT EXISTS user_activity_events(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),job_node_id bigint REFERENCES graph_nodes(id),event_type text,event_key text,surface text,metadata jsonb DEFAULT '{}',occurred_at timestamptz DEFAULT now(),UNIQUE(user_node_id,event_key));
      CREATE TABLE IF NOT EXISTS organization_search_documents(organization_node_id bigint,organization_id text,payload jsonb);
      CREATE TABLE IF NOT EXISTS recommendation_embedding_documents(kind text,node_id bigint,status text,content_hash text);
      CREATE TABLE project_search_documents(project_node_id bigint,project_id text,payload jsonb);
      CREATE TABLE IF NOT EXISTS recommendation_sentence_embeddings(kind text,node_id bigint,text_hash text,sentence text,weight numeric);
      ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS title text;
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS search_vector tsvector DEFAULT '';
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS organization_id text;
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS project_id text;
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS online boolean DEFAULT true;
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS blocked boolean DEFAULT false;
      ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS published_timestamp bigint DEFAULT (extract(epoch FROM now())*1000)::bigint;
      ALTER TABLE user_activity_events ADD COLUMN IF NOT EXISTS dwell_ms integer;
      CREATE TABLE IF NOT EXISTS user_job_preferences(user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),job_categories text[] DEFAULT '{}');
      ALTER TABLE user_job_preferences ADD COLUMN IF NOT EXISTS work_authorization text,
        ADD COLUMN IF NOT EXISTS requires_sponsorship boolean,ADD COLUMN IF NOT EXISTS minimum_salary numeric,
        ADD COLUMN IF NOT EXISTS salary_currency text;
      ALTER TABLE user_job_preferences ADD COLUMN IF NOT EXISTS screening_location_preferences jsonb,
        ADD COLUMN IF NOT EXISTS residence_country text,ADD COLUMN IF NOT EXISTS utc_offset_minutes integer;
      DO $setup$ BEGIN
        IF to_regprocedure('recommendation_embedding_content(text,bigint)') IS NULL THEN
          EXECUTE 'CREATE FUNCTION recommendation_embedding_content(text,bigint) RETURNS text LANGUAGE sql STABLE AS ''SELECT ''''[]''''::text''';
          EXECUTE 'CREATE VIEW recommendation_embedding_inputs AS SELECT ''user''::text AS kind,id AS node_id,recommendation_embedding_content(''user'',id) AS content FROM graph_nodes WHERE label=''User''';
        END IF;
      END $setup$;
    `);
    for (const file of ["career-agent.sql", "mcp-access.sql", "career-agent-workflows.sql", "career-agent-screening.sql", "career-agent-hosted.sql", "career-agent-provider-api.sql", "candidate-capabilities.sql", "candidate-stripe-billing.sql", "career-evidence-usability.sql", "career-agent-draft-editing.sql", "career-agent-enrichment.sql", "career-agent-cv-baseline.sql", "candidate-model-selection.sql"])
      await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
    for (const file of ["career-agent-screening-workflow.sql", "career-agent-screening-governance.sql", "candidate-documents.sql", "candidate-document-provenance.sql", "candidate-device-execution.sql", "candidate-voice.sql"])
      await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
    const comparison = readFileSync("scripts/sql/career-agent-cv-matching.sql", "utf8");
    await db.query(comparison.slice(comparison.indexOf("CREATE TABLE IF NOT EXISTS candidate_cv_job_reviews")));
    await db.query("ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS embedding_node_id bigint");
    await installCandidateGeographyFixture(db);
    career = new CareerRepository(db);
    applications = new ApplicationService(db, career);
    agent = createDeviceAgent(db, career, config);
    const screening = new ScreeningService(db, career, config, new ScreeningGovernanceService(db, career));
    const profiles = new ProfileService(new ProfileRepository(db), undefined, undefined, config, undefined, career);
    capabilities = new CandidateCapabilityService(career, applications, db, undefined, profiles, screening, agent,
      new SubscriptionService(db, career, config), new VoiceConnectionService(db, career),
      new CandidateSetupService(db, career, config), new CandidateMatchingService(db, career, undefined, screening), undefined,
      new CandidateDocumentsService(db, career, new CandidateSetupService(db, career, config), agent, new CandidateDocumentCodec(), config, profiles),
      undefined, new ScreeningGovernanceService(db, career));
    tools = new CareerToolService(career, db, capabilities, screening);
  });
  afterAll(async () => {
    if (db) { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.onModuleDestroy(); }
  });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes CASCADE");
    await db.query("TRUNCATE organization_search_documents,project_search_documents,job_availability_extractions,job_work_location_options");
    for (const wallet of ["alice", "bob"]) {
      const [user] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('User',jsonb_build_object('wallet',$1::text,'available',true)) RETURNING id::text", [wallet]);
      const context: CandidateInvocationContext = { kind: "session", owner: user.id, wallet };
      if (wallet === "alice") alice = context; else bob = context;
      await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,status,paid_until) VALUES($1,$2,'https://checkout.stripe.com/c/pay/fixture','active',now()+interval '1 day')", [randomUUID(), user.id]);
    }
  });

  async function grant(scopes: CandidateScope[] = ["account:read", "account:write", "career:read", "career:write"], owner = alice) {
    const clientId = randomUUID(), grantId = randomUUID();
    await db.query("INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,'test-client','[\"https://client.test/callback\"]')", [clientId]);
    await db.query("INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at) VALUES($1,$2,$3,'https://mcp.test', $4,now()+interval '1 hour')", [grantId, owner.owner, clientId, scopes.join(" ")]);
    return { kind: "oauth", owner: owner.owner, wallet: owner.wallet, clientId, grantId, scopes } satisfies CandidateInvocationContext;
  }

  async function worker(sourceDocumentId?: string, objectKind?: string, shortUUID?: string) {
    const connectionId = randomUUID(), sessionId = randomUUID(), agentRequestId = randomUUID(), workerId = randomUUID();
    await deviceConnectionFixture(db, alice.owner, { id: connectionId, provider: "codex" });
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id,context_seed,object_kind) VALUES($1,$2,$3,$4,$5)", [sessionId, alice.owner, connectionId, JSON.stringify({ sourceDocumentId, shortUUID }), objectKind ?? null]);
    await db.query("INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt,status,worker_id,heartbeat_at) VALUES($1,$2,$3,'Read the selected CV','running',$4,now())", [agentRequestId, sessionId, alice.owner, workerId]);
    await leaseDeviceRequestFixture(db, agentRequestId, workerId);
    return { kind: "worker", owner: alice.owner, wallet: alice.wallet, workerId, agentRequestId } satisfies CandidateInvocationContext;
  }

  it("exposes the selected pending tracker revision before a source-bound CV draft exists", async () => {
    const source = await career.pasteCv("alice", "Built accessible payment APIs", "Selected CV");
    for (const shortUUID of ["selected-role", "another-role"]) {
      const [job] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost',jsonb_build_object('shortUUID',$1::text)) RETURNING id::text", [shortUUID]);
      await db.query("INSERT INTO job_search_documents(job_node_id,short_uuid,payload,filter_labels) VALUES($1,$2,$3,'{}')", [job.id, shortUUID, JSON.stringify({ shortUUID, title: "Engineer" })]);
      await career.action("alice", { ...mutation(), shortUUID, action: "preparing", surface: "applications" });
    }
    const context = await worker(source.id, undefined, "selected-role");
    const profileLookup = jest.spyOn(ProfileService.prototype, "getCareerContext").mockResolvedValue({ preferences: null });
    const response = await capabilities.invoke(context, "career_read", {}).finally(() => profileLookup.mockRestore());
    const data = response.data as { applications: { id: string; shortUUID: string; revision: number }[] };
    expect(data.applications).toEqual([expect.objectContaining({ shortUUID: "selected-role", revision: 1 })]);
    expect(await applications.documents("alice")).toEqual([]);
  });

  it("keeps session, OAuth and leased worker reads on the same owned source while rejecting foreign identities", async () => {
    const source = await career.pasteCv("alice", "Built accessible web applications", "Selected CV");
    const oauth = await grant(), hosted = await worker();
    const expected = await capabilities.invoke(alice, "source_document_read", { documentId: source.id });
    expect(expected.data).toMatchObject({ extraction: { status: "unparsed", profileReady: false, errorCode: null } });
    expect(await capabilities.invoke(oauth, "source_document_read", { documentId: source.id })).toEqual(expected);
    const reply = await tools.mcp(hosted.workerId, hosted.agentRequestId, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "source_document_read", arguments: { documentId: source.id } } }) as { result: { content: { text: string }[] } };
    expect(JSON.parse(reply.result.content[0].text)).toEqual(expected.data);
    await expect(capabilities.invoke(bob, "source_document_read", { documentId: source.id })).rejects.toThrow("not found");
    await expect(capabilities.invoke({ ...alice, owner: bob.owner }, "source_document_read", { documentId: source.id })).rejects.toThrow();
    await expect(capabilities.invoke(alice, "source_document_read", { documentId: source.id, wallet: "bob" })).rejects.toThrow("Invalid capability input");
  });

  it.each(["source", "provenance", "generation", "device"])("rejects a device tool after its %s authority changes", async change => {
    const source = await career.pasteCv("alice", "Built accessible web applications", "Selected CV");
    const context = await worker(source.id);
    expect((await capabilities.invoke(context, "source_document_read", { documentId: source.id })).data).toMatchObject({ id: source.id });
    if (change === "source") await db.query("UPDATE candidate_documents SET source_text='Changed source' WHERE id=$1", [source.id]);
    if (change === "provenance") {
      const [document] = await db.query<{ content_hash: string; source_text: string }>(
        "SELECT content_hash,source_text FROM candidate_documents WHERE id=$1", [source.id]);
      const provenance = unknownDocumentProvenance(document.content_hash, document.source_text);
      provenance.limitations = "Updated extraction review cannot establish original text visibility.";
      await db.query("UPDATE candidate_documents SET extraction_provenance=$2 WHERE id=$1",
        [source.id, JSON.stringify(provenance)]);
    }
    if (change === "generation") await db.query("UPDATE candidate_ai_connections SET generation=generation+1 WHERE user_node_id=$1", [alice.owner]);
    if (change === "device") await db.query("UPDATE candidate_devices SET status='revoked' WHERE user_node_id=$1", [alice.owner]);
    await expect(capabilities.invoke(context, "source_document_read", { documentId: source.id })).rejects.toThrow();
    await expect(tools.mcp(context.workerId, context.agentRequestId, { jsonrpc: "2.0", id: 1, method: "tools/list" })).rejects.toThrow();
    expect(await career.textDocument("alice", source.id)).toMatchObject({ id: source.id });
  });

  it("keeps signed voice delegation separate from human approvals and the tool worker", async () => {
    const { device } = await deviceConnectionFixture(db, alice.owner);
    const context: CandidateInvocationContext = { kind: "device", owner: alice.owner, wallet: alice.wallet, deviceId: device.id };
    expect((await capabilities.catalog(context)).map(entry => entry.name).sort()).toEqual(["career_result", "career_run"]);
    for (const capability of ["introduction_update", "screening_policy_approve", "source_parse", "connection_setup", "application_action", "career_propose_fact"])
      await expect(capabilities.invoke(context, capability, {})).rejects.toThrow();
    await db.query("UPDATE candidate_devices SET status='revoked' WHERE id=$1", [device.id]);
    await expect(capabilities.catalog(context)).rejects.toThrow();
  });

  it("reads the full vacancy only with an eligible owned source and never switches a worker's pin", async () => {
    const selected = await career.pasteCv("alice", "Amsterdam, Netherlands. Built payment systems.", "Selected CV");
    const elsewhere = await career.pasteCv("alice", "San Francisco, United States. Built payment systems.", "Other CV");
    const foreign = await career.pasteCv("bob", "Amsterdam, Netherlands. Built payment systems.", "Foreign CV");
    for (const [source, city, countryCode] of [[selected, "Amsterdam", "NL"], [elsewhere, "San Francisco", "US"], [foreign, "Amsterdam", "NL"]] as const) {
      await bindScreeningSourceFixture(db, source.id);
      await db.query(`UPDATE candidate_documents SET parsed_result=jsonb_set(parsed_result,'{location}',jsonb_build_object('city',$2::text,'countryCode',$3::text)) WHERE id=$1`, [source.id, city, countryCode]);
    }
    const originalAd = "Build payment systems onsite in Amsterdam.\n" + "Complete original requirements.\n".repeat(760) + "Final application instructions.";
    const [org] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{\"orgId\":\"payments\"}') RETURNING id::text");
    const [job] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost','{\"shortUUID\":\"amsterdam-role\"}') RETURNING id::text");
    const [ad] = await db.query<{ id: string }>("INSERT INTO graph_nodes(label,properties) VALUES('Jobpost',jsonb_build_object('content',$1::text)) RETURNING id::text", [originalAd]);
    await db.query("INSERT INTO organization_search_documents VALUES($1,'payments','{\"name\":\"Payments\"}')", [org.id]);
    await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_STRUCTURED_JOBPOST')", [ad.id, job.id]);
    await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,payload,filter_labels) VALUES($1,'amsterdam-role','payments','{"title":"Payments engineer"}','{}')`, [job.id]);
    await saveCandidateGeographyFixture(db, job.id, ad.id);
    await db.query(`UPDATE job_work_location_options SET mode='onsite',scope='city',office_city='Amsterdam',office_location='{"city":"Amsterdam","countryCode":"NL"}' WHERE raw_job_node_id=$1`, [ad.id]);
    await db.query(`UPDATE job_search_documents SET work_arrangement='{"version":"WorkArrangementV1","classification":"onsite","fullyRemote":false}' WHERE job_node_id=$1`, [job.id]);

    const input = { shortUUID: "amsterdam-role", sourceDocumentId: selected.id };
    for (const context of [alice, await grant()]) {
      expect((await capabilities.invoke(context, "vacancy_read", input)).data).toMatchObject({ short_uuid: input.shortUUID, originalAd });
      await expect(capabilities.invoke(context, "vacancy_read", { shortUUID: input.shortUUID })).rejects.toThrow("Eligible vacancy not found");
      await expect(capabilities.invoke(context, "vacancy_read", { ...input, sourceDocumentId: foreign.id })).rejects.toThrow("Eligible vacancy not found");
      await expect(capabilities.invoke(context, "vacancy_read", { ...input, sourceDocumentId: elsewhere.id })).rejects.toThrow("Eligible vacancy not found");
    }
    await expect(capabilities.invoke(bob, "vacancy_read", input)).rejects.toThrow("Eligible vacancy not found");
    const pinned = await worker(selected.id, undefined, input.shortUUID);
    expect((await capabilities.invoke(pinned, "vacancy_read", { shortUUID: input.shortUUID })).data).toMatchObject({ originalAd });
    expect((await capabilities.invoke(pinned, "vacancy_read", input)).data).toMatchObject({ originalAd });
    for (const sourceDocumentId of [elsewhere.id, foreign.id])
      await expect(capabilities.invoke(pinned, "vacancy_read", { ...input, sourceDocumentId })).rejects.toThrow("selected source");
    await db.query("UPDATE candidate_agent_requests SET status='completed' WHERE id=$1", [pinned.agentRequestId]);
    const incompatiblePin = await worker(elsewhere.id, undefined, input.shortUUID);
    await expect(capabilities.invoke(incompatiblePin, "vacancy_read", { shortUUID: input.shortUUID })).rejects.toThrow("Eligible vacancy not found");
    await expect(capabilities.invoke(incompatiblePin, "vacancy_read", input)).rejects.toThrow("selected source");
  });

  it.each(["Organization", "Project"])("ignores a %s privately and cancels all its pending and active evaluation work", async label => {
    const source = await career.pasteCv("alice", "Built payment systems.", "Selected CV");
    const otherSource = await career.pasteCv("bob", "Built payment systems.", "Other candidate CV");
    const [employer] = await db.query<{ id: string }>(
      "INSERT INTO graph_nodes(label,properties) VALUES($1,jsonb_build_object('id','ignored-company','orgId','ignored-company')) RETURNING id::text", [label]);
    const jobs: Record<string, string> = {};
    for (const shortUUID of ["ignored-pending", "ignored-running", "ignored-queued", "ignored-saved", "kept"]) {
      const [job] = await db.query<{ id: string }>(
        "INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost',jsonb_build_object('shortUUID',$1::text)) RETURNING id::text", [shortUUID]);
      jobs[shortUUID] = job.id;
      await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,project_id,payload,filter_labels)
        VALUES($1,$2,$3,$4,jsonb_build_object('title',$2::text),'{}')`,
        [job.id, shortUUID, label === "Organization" ? shortUUID === "kept" ? "other-company" : "ignored-company" : null,
          label === "Project" ? shortUUID === "kept" ? "other-company" : "ignored-company" : null]);
    }
    const active = await worker(source.id, undefined, "ignored-running");
    await db.query("UPDATE candidate_agent_requests SET request_kind='screening' WHERE id=$1", [active.agentRequestId]);
    const [session] = await db.query<{ id: string; connection_id: string }>(
      "SELECT s.id,s.connection_id FROM candidate_agent_sessions s JOIN candidate_agent_requests a ON a.session_id=s.id WHERE a.id=$1", [active.agentRequestId]);
    const queued = randomUUID(), otherConnection = randomUUID(), otherSession = randomUUID(), otherRequest = randomUUID();
    await db.query("INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt,status,request_kind) VALUES($1,$2,$3,'Review job','queued','screening')", [queued, session.id, alice.owner]);
    await db.query("INSERT INTO candidate_ai_connections(id,user_node_id,provider,status) VALUES($1,$2,'codex','connected')", [otherConnection, bob.owner]);
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id) VALUES($1,$2,$3)", [otherSession, bob.owner, otherConnection]);
    await db.query("INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt,status,request_kind) VALUES($1,$2,$3,'Review job','queued','screening')", [otherRequest, otherSession, bob.owner]);
    const ownRun = randomUUID(), otherRun = randomUUID();
    for (const [id, owner, document, connection] of [[ownRun, alice.owner, source.id, session.connection_id], [otherRun, bob.owner, otherSource.id, otherConnection]])
      await db.query(`INSERT INTO candidate_screening_runs(id,user_node_id,document_id,connection_id,cv_text,cv_hash,candidate_context,rubric_hash,candidate_cv,policy_snapshot,provenance_hash)
        VALUES($1,$2,$3,$4,'Built payment systems.','hash','{}','rubric','Built payment systems.',$5,'source-provenance')`,
        [id, owner, document, connection, JSON.stringify(await new ScreeningGovernanceService(db, career).snapshotPolicy(owner))]);
    for (const [index, shortUUID] of Object.keys(jobs).entries()) {
      const request = shortUUID === "ignored-running" ? active.agentRequestId : shortUUID === "ignored-queued" ? queued : null;
      const saved = shortUUID === "ignored-saved";
      await db.query(`INSERT INTO candidate_screening_jobs(id,run_id,job_node_id,short_uuid,title,company,job_payload,job_text,ad_hash,additional_context,ordinal,status,request_id,assessment)
        VALUES($1,$2,$3,$4,$4,'Company','{}','Original ad','hash','{}',$5,$6,$7,$8)`,
        [randomUUID(), ownRun, jobs[shortUUID], shortUUID, index, saved ? "completed" : request ? "running" : "pending", request, saved ? '{"recommendation":"interview"}' : null]);
    }
    await db.query(`INSERT INTO candidate_screening_jobs(id,run_id,job_node_id,short_uuid,title,company,job_payload,job_text,ad_hash,additional_context,ordinal,status,request_id)
      VALUES($1,$2,$3,'ignored-pending','Role','Company','{}','Original ad','hash','{}',0,'running',$4)`,
      [randomUUID(), otherRun, jobs["ignored-pending"], otherRequest]);
    await db.query(`INSERT INTO candidate_screening_stage_requests(request_id,job_id,stage,artifact)
      SELECT request_id,id,current_stage,assessment FROM candidate_screening_jobs WHERE run_id=ANY($1::uuid[]) AND request_id IS NOT NULL`, [[ownRun, otherRun]]);
    for (const shortUUID of ["ignored-saved", "kept"])
      await db.query(`INSERT INTO candidate_cv_job_reviews(id,user_node_id,document_id,short_uuid,revision,cv_hash,ad_hash,original_ad_text,content,agent_request_id)
        VALUES($1,$2,$3,$4,1,'hash','hash','Original ad','{}',$5)`,
        [randomUUID(), alice.owner, source.id, shortUUID, active.agentRequestId]);
    expect((await career.cvReviews("alice", source.id)).map(row => row.shortUUID).sort()).toEqual(["ignored-saved", "kept"]);
    const block = { ...mutation(), shortUUID: "ignored-pending", action: "block_company", surface: "discover_list" };
    expect((await capabilities.invoke(alice, "application_action", block)).data).toMatchObject({ state: { companyBlocked: true } });
    expect(await db.query(`SELECT status FROM candidate_agent_requests WHERE id=ANY($1::uuid[])`, [[active.agentRequestId, queued]]))
      .toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
    expect(await db.query(`SELECT short_uuid,status FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY short_uuid`, [ownRun]))
      .toEqual([
        { short_uuid: "ignored-pending", status: "unavailable" }, { short_uuid: "ignored-queued", status: "unavailable" },
        { short_uuid: "ignored-running", status: "unavailable" }, { short_uuid: "ignored-saved", status: "completed" },
        { short_uuid: "kept", status: "pending" },
      ]);
    await expect(agent.workerEvent(active.workerId, active.agentRequestId, { type: "heartbeat" })).rejects.toThrow("not active");
    await expect(new ScreeningService(db, career, config, new ScreeningGovernanceService(db, career)).persist(active.workerId, active.agentRequestId, {})).rejects.toThrow("no longer active");
    expect(await db.query("SELECT status FROM candidate_agent_requests WHERE id=$1", [otherRequest])).toEqual([{ status: "queued" }]);
    expect(await db.query("SELECT source_id::text AS owner FROM graph_relationships WHERE target_id=$1 AND type='BLOCKED_ORG_JOBS'", [employer.id]))
      .toEqual([{ owner: alice.owner }]);
    expect((await capabilities.invoke(alice, "application_action", block)).data).toMatchObject({ state: { companyBlocked: true }, revision: 1 });
    expect((await career.cvReviews("alice", source.id)).map(row => row.shortUUID)).toEqual(["kept"]);
  });

  it("enforces exact scopes, live grant expiry and revocation even before replaying an owned mutation receipt", async () => {
    const oauth = await grant(), other = await grant();
    const input = { ...mutation(), text: "Maintained transaction processing services" };
    const first = await capabilities.invoke(oauth, "source_text_create", input);
    const firstSource = first.data;
    if (!firstSource || typeof firstSource !== "object" || !("id" in firstSource) || typeof firstSource.id !== "string")
      throw new Error("Expected an owned source ID");
    expect(await capabilities.invoke(oauth, "source_text_create", input)).toEqual(first);
    await expect(capabilities.invoke(other, "source_text_create", input)).rejects.toThrow("Request ID");
    await expect(capabilities.invoke(alice, "source_text_create", input)).rejects.toThrow("Request ID");
    await expect(capabilities.invoke(oauth, "source_text_create", { ...input, text: "Changed source" })).rejects.toThrow("Request ID");
    const readOnly = await grant(["career:read"]);
    await expect(capabilities.invoke(readOnly, "source_text_create", { ...mutation(), text: "No write permission" })).rejects.toThrow("Permission career:write");
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second' WHERE user_node_id=$1", [alice.owner]);
    expect(await capabilities.invoke(oauth, "source_text_create", input)).toEqual(first);
    await expect(capabilities.invoke(oauth, "source_parse", { ...mutation(), documentId: firstSource.id, purpose: "career" })).rejects.toThrow("Advanced");
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()+interval '1 day' WHERE user_node_id=$1", [alice.owner]);
    await db.query("UPDATE mcp_grants SET scope='career:read' WHERE id=$1", [oauth.grantId]);
    await expect(capabilities.invoke(oauth, "source_text_create", input)).rejects.toThrow("permissions changed");
    await db.query("UPDATE mcp_grants SET expires_at=now()-interval '1 second' WHERE id=$1", [other.grantId]);
    await expect(capabilities.invoke(other, "source_document_list", {})).rejects.toThrow();
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [readOnly.grantId]);
    await expect(capabilities.invoke(readOnly, "source_document_list", {})).rejects.toThrow();
    const [count] = await db.query("SELECT count(*)::int AS count FROM candidate_documents WHERE user_node_id=$1", [alice.owner]);
    expect(count.count).toBe(1);
  });

  it("rejects revoked authority during a read and before mutation commit", async () => {
    const oauth = await grant();
    const original = career.career.bind(career);
    const read = jest.spyOn(career, "career").mockImplementationOnce(async wallet => {
      const state = await original(wallet);
      await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [oauth.grantId]);
      return state;
    });
    await expect(capabilities.invoke(oauth, "source_document_list", {})).rejects.toThrow();
    read.mockRestore();
    const live = await grant();
    await expect(career.withCandidateInvocation(live, "proof", false, () => career.mutate("alice", "proof", mutation(), async tx => {
      await tx.query("UPDATE mcp_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [live.grantId]);
      return { private: "must not commit" };
    }))).rejects.toThrow();
    const [count] = await db.query("SELECT count(*)::int AS count FROM candidate_mutations WHERE user_node_id=$1", [alice.owner]);
    expect(count.count).toBe(0);
  });

  it("supports unpaid recovery and availability revocation without permitting paid work or an opt-in", async () => {
    const source = await career.pasteCv("alice", "Original saved CV");
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second' WHERE user_node_id=$1", [alice.owner]);
    expect((await capabilities.invoke(alice, "source_document_read", { documentId: source.id })).data).toMatchObject({ id: source.id });
    const status = (await capabilities.invoke(alice, "availability_read", {})).data as { expectedVersion: string; revision: number };
    const input = { requestId: randomUUID(), revision: status.revision, expectedVersion: status.expectedVersion, available: false };
    expect((await capabilities.invoke(alice, "availability_set", input)).data).toMatchObject({ revision: 1 });
    expect((await capabilities.invoke(alice, "availability_read", {})).data).toMatchObject({ available: false });
    await expect(capabilities.invoke(alice, "availability_set", { ...input, requestId: randomUUID() })).rejects.toThrow("changed");
    await expect(capabilities.invoke(alice, "availability_set", { ...input, requestId: randomUUID(), available: true })).rejects.toThrow("Advanced");
    const saved = await capabilities.invoke(alice, "source_text_create", { ...mutation(), text: "New CV" });
    const savedSource = saved.data;
    if (!savedSource || typeof savedSource !== "object" || !("id" in savedSource) || typeof savedSource.id !== "string")
      throw new Error("Expected an owned source ID");
    expect((await capabilities.invoke(alice, "source_document_read", { documentId: savedSource.id })).data)
      .toMatchObject({ text: "New CV", extraction: { status: "unparsed", profileReady: false } });
    await expect(capabilities.invoke(alice, "source_parse", { ...mutation(), documentId: savedSource.id, purpose: "career" })).rejects.toThrow("Advanced");
  });

  it("constrains selected-source worker reads while preserving ordinary account exploration", async () => {
    const selected = await career.pasteCv("alice", "Selected CV exact text"), unrelated = await career.pasteCv("alice", "Unrelated CV private text");
    const selectedFact = randomUUID(), otherFact = randomUUID(), supportFact = randomUUID();
    const evidence = [
      { id: selectedFact, statement: "Selected source fact", excluded: false, conflicts: [], source: { kind: "document", documentId: selected.id, excerpt: "Selected CV exact text" } },
      { id: otherFact, statement: "Unrelated source fact", excluded: false, conflicts: [], source: { kind: "document", documentId: unrelated.id, excerpt: "Unrelated CV private text" } },
      { id: supportFact, statement: "Candidate-authored supporting fact", excluded: false, conflicts: [], source: { kind: "candidate", excerpt: null, candidateAuthored: true } },
    ];
    await db.query("INSERT INTO candidate_career_profiles(user_node_id,evidence) VALUES($1,$2)", [alice.owner, JSON.stringify(evidence)]);
    const unrelatedCv = randomUUID(), relatedCv = randomUUID();
    for (const [id, evidenceIds] of [[unrelatedCv, [otherFact]], [relatedCv, [selectedFact, supportFact]]] as const)
      await db.query("INSERT INTO candidate_cv_versions(id,cv_id,user_node_id,revision,name,selections) VALUES($1,$1,$2,1,'Owned CV',$3)", [id, alice.owner, JSON.stringify(evidenceIds.map(evidenceId => ({ evidenceId, text: "Saved wording" })))]);
    const bound = await worker(selected.id);
    await expect(capabilities.invoke(bound, "source_document_read", { documentId: unrelated.id })).rejects.toThrow("selected source");
    await expect(capabilities.invoke(bound, "cv_read", { cvId: unrelatedCv })).rejects.toThrow("unrelated CV");
    expect((await capabilities.invoke(bound, "cv_read", { cvId: relatedCv })).data).toMatchObject({ id: relatedCv });
    const complete = (await capabilities.invoke(bound, "cv_create", {
      ...mutation(), sourceDocumentId: selected.id, name: "Complete CV", selections: [],
    })).data as { id: string };
    expect((await capabilities.invoke(bound, "cv_read", { cvId: complete.id })).data)
      .toMatchObject({ baseline: { sourceDocumentId: selected.id }, selections: [] });
    const foreignBaseline = await applications.saveCv("alice", {
      ...mutation(), sourceDocumentId: unrelated.id, name: "Other source CV", selections: [],
    });
    await db.query("UPDATE candidate_cv_versions SET selections=$2 WHERE id=$1",
      [foreignBaseline.id, JSON.stringify([{ evidenceId: selectedFact, text: "Selected source fact" }])]);
    await expect(capabilities.invoke(bound, "cv_read", { cvId: foreignBaseline.id })).rejects.toThrow("unrelated CV");
    await expect(capabilities.invoke(bound, "career_propose_fact", { ...mutation(), statement: "Changed fact", documentId: unrelated.id, excerpt: "Unrelated CV private text" })).rejects.toThrow("selected source");
    const proposed = await capabilities.invoke(bound, "career_propose_fact", {
      ...mutation(), statement: "Selected CV exact text", documentId: selected.id, excerpt: "Selected CV exact text",
    });
    expect(JSON.stringify(proposed)).not.toContain("Unrelated source fact");
    expect(JSON.stringify(proposed)).not.toContain("Unrelated CV private text");
    expect(JSON.stringify(proposed)).toContain("Selected CV exact text");
    expect((await career.usableEvidence("alice")).find(item => item.statement === "Selected CV exact text")?.source.authority).toBe("extraction");
    expect((await career.career("alice")).evidence.some(item => item.id === otherFact)).toBe(true);
    await db.query("UPDATE candidate_agent_requests SET heartbeat_at=now()-interval '46 seconds' WHERE id=$1", [bound.agentRequestId]);
    await expect(capabilities.invoke(bound, "source_document_read", { documentId: selected.id })).rejects.toThrow();
    await db.query("UPDATE candidate_agent_requests SET status='completed' WHERE id=$1", [bound.agentRequestId]);
    const broad = await worker();
    expect((await capabilities.invoke(broad, "source_document_read", { documentId: unrelated.id })).data).toMatchObject({ id: unrelated.id });
  });

  it("binds queued work/results/cancellation to its OAuth grant and exposes only safe persisted event fields", async () => {
    const oauth = await grant(), other = await grant();
    const connectionId = randomUUID();
    await deviceConnectionFixture(db, alice.owner, { id: connectionId, provider: "codex", online: false });
    const input = { ...mutation(), connectionId, prompt: "Ask one question with tap choices" };
    const queued = (await capabilities.invoke(oauth, "career_run", input)).data as { requestId: string; sessionId: string };
    expect((await capabilities.invoke(oauth, "career_run", input)).data).toEqual(queued);
    for (const event of [
      { type: "text", text: "Choose a direction", tool: "hidden-tool" },
      { type: "tool", payload: "hidden-tool-payload" },
      { type: "usage", provider: "codex", model: "configured-model", inputTokens: 12, outputTokens: 4, credential: "hidden-credential" },
      { type: "suggestions", question: "Which direction?", replies: ["Engineering", "Product"], reasoning: "hidden-reasoning" },
      { type: "object", kind: "cv", id: randomUUID(), revision: 1, payload: "hidden-document" },
    ]) await db.query("INSERT INTO candidate_agent_events(request_id,event) VALUES($1,$2)", [queued.requestId, JSON.stringify(event)]);
    const result = await capabilities.invoke(oauth, "career_result", { requestId: queued.requestId });
    expect(JSON.stringify(result)).not.toContain("hidden-");
    expect(result.data).toMatchObject({ status: "waiting_for_device", events: expect.arrayContaining([expect.objectContaining({ event: { type: "text", text: "Choose a direction" } }), expect.objectContaining({ event: { type: "suggestions", question: "Which direction?", replies: ["Engineering", "Product"] } })]) });
    expect(await capabilities.invoke(alice, "career_result", { requestId: queued.requestId })).toEqual(result);
    await expect(capabilities.invoke(other, "career_result", { requestId: queued.requestId })).rejects.toThrow("not found");
    await expect(capabilities.invoke(other, "career_cancel", { ...mutation(), agentRequestId: queued.requestId })).rejects.toThrow("not found");
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [oauth.grantId]);
    await expect(capabilities.invoke(oauth, "career_result", { requestId: queued.requestId })).rejects.toThrow();
    expect((await capabilities.invoke(alice, "career_cancel", { ...mutation(), agentRequestId: queued.requestId })).data).toMatchObject({ status: "cancelled" });
  });

  it("keeps generated writes and private graph operations out of external clients, and recursive work out of workers", async () => {
    const oauth = await grant(), hosted = await worker();
    for (const name of ["cv_job_review_save", "career_propose_fact", "application_propose", "introduction_save"])
      await expect(capabilities.invoke(oauth, name, {})).rejects.toThrow("actor");
    await expect(capabilities.invoke(oauth, "network_paths", {})).rejects.toThrow();
    for (const name of ["career_run", "connection_setup"])
      await expect(capabilities.invoke(hosted, name, {})).rejects.toThrow("actor");
    const source = await career.pasteCv("alice", "Source-backed experience");
    await expect(capabilities.invoke(hosted, "career_propose_fact", { ...mutation(), statement: "Fabricated authority", authority: "extraction", documentId: source.id })).rejects.toThrow("Invalid capability input");
    await db.query("UPDATE candidate_agent_requests SET status='completed' WHERE id=$1", [hosted.agentRequestId]);
    const research = await worker(undefined, "mcp_research");
    const researchGrant = await grant(["data:read"]);
    await db.query("INSERT INTO mcp_research_requests(request_id,user_node_id,grant_id,input_hash) VALUES($1,$2,$3,'fixture')",
      [research.agentRequestId, alice.owner, researchGrant.grantId]);
    const list = await tools.mcp(research.workerId, research.agentRequestId, { jsonrpc: "2.0", id: 1, method: "tools/list" }) as { result: { tools: unknown[] } };
    expect(list.result.tools).toEqual([]);
    await expect(tools.mcp(research.workerId, research.agentRequestId, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "source_document_read", arguments: { documentId: source.id } } })).rejects.toThrow("Research");
  });

  it("reports paired offline configuration separately from execution availability", async () => {
    const { id, device } = await deviceConnectionFixture(db, alice.owner, { provider: "codex", online: false });
    const response = await capabilities.invoke(alice, "connection_status", {});
    expect(response.data).toMatchObject({ reasoning: [{ id, deviceId: device.id, provider: "codex",
      status: "connected", execution: "device", availability: "waiting_for_device" }] });
    await db.query(`UPDATE candidate_ai_connections SET status='connected',public_state=public_state||'{"model":"gpt-6-sol","reasoningEffort":"high"}'::jsonb WHERE id=$1`, [id]);
    expect((await capabilities.invoke(alice, "connection_status", {})).data)
      .toMatchObject({ reasoning: [{ id, model: "gpt-6-sol", reasoningEffort: "high" }] });
    await db.query(`UPDATE candidate_ai_connections SET public_state=public_state||'{"reasoningEffort":null}'::jsonb WHERE id=$1`, [id]);
    expect((await capabilities.invoke(alice, "connection_status", {})).data)
      .toMatchObject({ reasoning: [{ id, model: "gpt-6-sol", reasoningEffort: null }] });
  });

  it("rejects a stale screening preference review instead of overwriting newer saved choices", async () => {
    const read = (await capabilities.invoke(alice, "screening_preferences_read", {})).data as { expectedVersion: string; revision: number };
    const input = { ...mutation(), expectedVersion: read.expectedVersion, revision: read.revision, currentLocation: "Berlin", relocation: "not_open" };
    await capabilities.invoke(alice, "screening_preferences_update", input);
    await expect(capabilities.invoke(alice, "screening_preferences_update", { ...input, requestId: randomUUID(), currentLocation: "Paris" })).rejects.toThrow("changed");
    expect((await capabilities.invoke(alice, "screening_preferences_read", {})).data).toMatchObject({ preferences: { currentLocation: "Berlin", relocation: "not_open" } });
  });

  it("patches independent search details, preserves omitted fields and clears explicit nulls in canonical storage", async () => {
    const save = async (fields: Record<string, unknown>) => {
      const current = (await capabilities.invoke(alice, "screening_preferences_read", {})).data as { expectedVersion: string; revision: number };
      return (await capabilities.invoke(alice, "screening_preferences_update", { ...mutation(), expectedVersion: current.expectedVersion, revision: current.revision, ...fields })).data;
    };
    expect((await capabilities.invoke(alice, "screening_preferences_read", {})).data).toMatchObject({
      preferences: null, workAuthorization: null, requiresSponsorship: null, minimumSalary: null, salaryCurrency: null,
    });
    expect(await save({ currentLocation: "Berlin" })).toMatchObject({
      preferences: { currentLocation: "Berlin", relocation: null, destinations: null, notes: null },
      workAuthorization: null, requiresSponsorship: null,
    });
    expect(await save({ relocation: "specific_locations" })).toMatchObject({
      preferences: { currentLocation: "Berlin", relocation: "specific_locations", destinations: null },
    });
    await save({ workAuthorization: "EU working rights", requiresSponsorship: false, minimumSalary: 100000, salaryCurrency: "EUR" });
    expect(await save({ currentLocation: null, workAuthorization: null, minimumSalary: null })).toMatchObject({
      preferences: { currentLocation: null, relocation: "specific_locations", destinations: null },
      workAuthorization: null, requiresSponsorship: false, minimumSalary: null, salaryCurrency: "EUR",
    });
    expect((await capabilities.invoke(bob, "screening_preferences_read", {})).data).toMatchObject({
      preferences: null, workAuthorization: null, requiresSponsorship: null, minimumSalary: null, salaryCurrency: null,
    });
  });

  it("saves legal details without inventing location or salary and rejects invalid partial writes atomically", async () => {
    const current = (await capabilities.invoke(alice, "screening_preferences_read", {})).data as { expectedVersion: string; revision: number };
    const args = { ...mutation(), expectedVersion: current.expectedVersion, revision: current.revision, workAuthorization: "EU working rights" };
    expect((await capabilities.invoke(alice, "screening_preferences_update", args)).data).toMatchObject({
      preferences: null, workAuthorization: "EU working rights", requiresSponsorship: null, minimumSalary: null, salaryCurrency: null,
    });
    const next = (await capabilities.invoke(alice, "screening_preferences_read", {})).data as { expectedVersion: string; revision: number };
    for (const fields of [
      {}, { currentLocation: " " }, { relocation: "anywhere_maybe" }, { requiresSponsorship: "false" },
      { salaryCurrency: "eur" }, { minimumSalary: -1 }, { workAuthorization: "x".repeat(1001) }, { available: false },
    ])
      await expect(capabilities.invoke(alice, "screening_preferences_update", { ...mutation(), expectedVersion: next.expectedVersion, revision: next.revision, ...fields })).rejects.toThrow();
    expect((await capabilities.invoke(alice, "screening_preferences_read", {})).data).toMatchObject({
      expectedVersion: next.expectedVersion, preferences: null, workAuthorization: "EU working rights", requiresSponsorship: null,
    });
  });
});
