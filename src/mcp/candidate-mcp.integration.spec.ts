import { ScreeningGovernanceService } from "../career-agent/screening-governance.service";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileRepository } from "src/postgres/profile.repository";
import { ProfileService } from "src/auth/profile/profile.service";
import { CareerRepository } from "src/career-agent/career.repository";
import { ApplicationService } from "src/career-agent/application.service";
import { createDeviceAgent, deviceConnectionFixture } from "src/career-agent/device-execution.fixture";
import { SubscriptionService } from "src/career-agent/subscription.service";
import { VoiceConnectionService } from "src/career-agent/voice-connection.service";
import { CandidateSetupService } from "src/career-agent/candidate-setup.service";
import { CandidateCapabilityService } from "src/career-agent/candidate-capabilities.service";
import { JobsService } from "src/jobs/jobs.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { McpIdentity, McpOAuthService } from "./mcp-oauth.service";
import { McpDataService } from "./mcp-data.service";
import { McpDataController } from "./mcp-data.controller";
import { McpMeteringService } from "./mcp-metering.service";
import { CandidateDocumentsService } from "src/career-agent/candidate-documents.service";
import { CandidateDocumentCodec } from "src/career-agent/candidate-document-codec";

const databaseUrl = process.env.MCP_DATABASE_TEST_URL;
(databaseUrl ? describe : describe.skip)("Candidate MCP with live OAuth and isolated PostgreSQL", () => {
  let db: PostgresService, career: CareerRepository, candidate: CandidateCapabilityService;
  let oauth: McpOAuthService, data: McpDataService, app: INestApplication, base: string;
  let alice: McpIdentity & { auth: string }, other: McpIdentity & { auth: string }, bob: McpIdentity & { auth: string };
  const schema = `candidate_mcp_${randomUUID().replace(/-/g, "")}`;
  const settings = {
    NODE_ENV: "test", MCP_RESOURCE_URL: "http://127.0.0.1:3333/mcp",
    MCP_ISSUER_URL: "http://127.0.0.1:8085/mcp", MCP_FRONTEND_URL: "http://127.0.0.1:3001",
    RECRUITERS_PUBLIC_ORIGIN: "http://127.0.0.1:3001", CAREER_DATA_PROTECTION_KEY: "33".repeat(32),
    MCP_ADVANCED_MONTHLY_LIMIT: "2", MCP_USAGE_UNIT: "calls",
  };
  // Only public discovery boundaries are fixtures. OAuth, ownership, setup, queue,
  // receipts, membership and candidate projection use their real services/database.
  const jobs = { getJobsListWithSearch: jest.fn(async () => ({ page: 1, total: 1, count: 1, data: [{ id: "public-job" }] })) };
  const organizations = { getOrgsListWithSearch: jest.fn(async () => ({ page: 1, total: 1, count: 1, data: [{ orgId: "public-org" }] })) };
  const mutation = () => ({ requestId: randomUUID(), revision: 0 });

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/jobstash_mcp_test")
      throw new Error("Dedicated local MCP test database required");
    db = new PostgresService({ url: databaseUrl!, applicationName: "candidate-mcp-tests", maxConnections: 12, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`
      CREATE TABLE graph_nodes(id bigserial PRIMARY KEY,label text NOT NULL,properties jsonb NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now());
      CREATE TABLE graph_relationships(id bigserial PRIMARY KEY,source_id bigint REFERENCES graph_nodes(id),target_id bigint REFERENCES graph_nodes(id),type text,relationship_key text,properties jsonb,UNIQUE(source_id,target_id,type,relationship_key));
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),short_uuid text UNIQUE,title text,organization_id text,project_id text,payload jsonb,filter_labels jsonb,updated_at timestamptz DEFAULT now(),online boolean DEFAULT true,blocked boolean DEFAULT false,published_timestamp bigint DEFAULT (extract(epoch FROM now())*1000)::bigint);
      CREATE TABLE user_activity_events(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),job_node_id bigint REFERENCES graph_nodes(id),event_type text,event_key text,surface text,metadata jsonb DEFAULT '{}',occurred_at timestamptz DEFAULT now(),dwell_ms integer,UNIQUE(user_node_id,event_key));
      CREATE TABLE organization_search_documents(organization_node_id bigint,organization_id text,payload jsonb);
      CREATE TABLE recommendation_embedding_documents(kind text,node_id bigint,status text,content_hash text);
      CREATE TABLE recommendation_sentence_embeddings(kind text,node_id bigint,text_hash text,sentence text,weight numeric);
      CREATE TABLE user_job_preferences(user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),job_categories text[] DEFAULT '{}');
      CREATE FUNCTION recommendation_embedding_content(text,bigint) RETURNS text LANGUAGE sql STABLE AS 'SELECT ''[]''::text';
      CREATE VIEW recommendation_embedding_inputs AS SELECT 'user'::text AS kind,id AS node_id,recommendation_embedding_content('user',id) AS content FROM graph_nodes WHERE label='User';
    `);
    for (const file of ["career-agent.sql", "mcp-access.sql", "career-agent-workflows.sql", "career-agent-screening.sql", "career-agent-hosted.sql", "career-agent-provider-api.sql", "candidate-capabilities.sql", "candidate-stripe-billing.sql"])
      await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
    for (const file of ["candidate-model-selection.sql", "career-agent-screening-workflow.sql", "career-agent-screening-governance.sql", "candidate-document-provenance.sql", "candidate-documents.sql", "candidate-device-execution.sql", "candidate-voice.sql"])
      await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
    const comparison = readFileSync("scripts/sql/career-agent-cv-matching.sql", "utf8");
    await db.query(comparison.slice(comparison.indexOf("CREATE TABLE IF NOT EXISTS candidate_cv_job_reviews")));
    const config = new ConfigService(settings);
    career = new CareerRepository(db);
    const agent = createDeviceAgent(db, career, config);
    const profiles = new ProfileService(new ProfileRepository(db), undefined, undefined, config, undefined, career);
    candidate = new CandidateCapabilityService(career, new ApplicationService(db, career), db, undefined, profiles, undefined, agent,
      new SubscriptionService(db, career, config), new VoiceConnectionService(db, career),
      new CandidateSetupService(db, career, config), undefined, undefined,
      new CandidateDocumentsService(db, career, new CandidateSetupService(db, career, config), agent, new CandidateDocumentCodec(), config, profiles),
      undefined, new ScreeningGovernanceService(db, career));
    oauth = new McpOAuthService(db, career, config);
    data = new McpDataService(db, career, config, oauth, new McpMeteringService(db), jobs as unknown as JobsService,
      organizations as unknown as OrganizationsService, candidate);
    const module = await Test.createTestingModule({ controllers: [McpDataController], providers: [{ provide: McpDataService, useValue: data }] })
      .overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await db.onModuleDestroy();
    }
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    await db.query("TRUNCATE graph_nodes,mcp_clients RESTART IDENTITY CASCADE");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice","available":true}'),('User','{"wallet":"bob","available":true}')`);
    alice = await connect("alice");
    other = await connect("alice");
    bob = await connect("bob");
  });

  async function connect(wallet: string, scope = "data:read account:read account:write career:read career:write") {
    const client = await oauth.register({ client_name: "Local candidate app", redirect_uris: ["https://client.example/callback"] });
    const verifier = randomBytes(32).toString("base64url");
    const next = await oauth.authorize({ client_id: client.client_id, redirect_uri: "https://client.example/callback", state: "local-fixture",
      resource: settings.MCP_RESOURCE_URL, scope, response_type: "code", code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url") });
    const approved = await oauth.consent(wallet, new URL(next).searchParams.get("request")!, true);
    const token = await oauth.exchange({ grant_type: "authorization_code", client_id: client.client_id,
      redirect_uri: "https://client.example/callback", resource: settings.MCP_RESOURCE_URL,
      code: new URL(approved.redirectUrl).searchParams.get("code"), code_verifier: verifier });
    const auth = "Bearer " + token.access_token;
    return { auth, ...await oauth.identity(auth) };
  }
  async function activate() {
    await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,status,paid_until) VALUES('fixture-membership',1,'https://checkout.example/local','active',now()+interval '1 day')");
  }
  async function call(name: string, args: Record<string, unknown> = {}, authorization = alice.auth) {
    return fetch(base + "/mcp/data/call", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }) });
  }

  it("separates insufficient scope, expired identity and unpaid membership over HTTP", async () => {
    const legacy = await connect("alice", "data:read");
    const identity = await fetch(base + "/mcp/data/identity", { headers: { Authorization: legacy.auth } });
    expect(identity.status).toBe(200);
    const denied = await call("account_status", {}, legacy.auth);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toContain('error="insufficient_scope", scope="account:read"');
    expect(await denied.json()).toMatchObject({ error: "insufficient_scope", scope: "account:read" });
    const unpaid = await call("search_jobs", { requestId: randomUUID() });
    expect(unpaid.status).toBe(403);
    expect(unpaid.headers.get("www-authenticate")).toBeNull();
    expect((await unpaid.json()).error).not.toBe("invalid_token");
    await oauth.disconnect("alice", legacy.grantId);
    const revoked = await call("account_status", {}, legacy.auth);
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    expect(await revoked.json()).toMatchObject({ error: "invalid_token" });
  });

  it("filters permissions rather than membership and keeps unpaid setup and recovery reachable", async () => {
    const read = await connect("alice", "account:read career:read");
    const names = (await data.tools(read.auth)).tools.map(tool => tool.name);
    expect(names).toEqual(expect.arrayContaining(["account_status", "source_document_read", "career_result"]));
    for (const name of ["search_jobs", "source_text_create", "connection_setup", "cv_job_review_save", "network_paths", "evidence_confirm"])
      expect(names).not.toContain(name);
    const status = await call("account_status");
    expect(status.status).toBe(200);
    expect((await status.json()).structuredContent.data).toMatchObject({ identity: { wallet: "alice" }, membership: { advanced: false }, nextStep: "membership" });
    const setupInput = { ...mutation(), purpose: "reasoning" };
    const setup = await data.call(alice.auth, { name: "connection_setup", arguments: setupInput });
    expect(setup.structuredContent.data).toMatchObject({ id: setupInput.requestId, status: "pending", url: `${settings.RECRUITERS_PUBLIC_ORIGIN}/setup/${setupInput.requestId}` });
    await expect(data.call(other.auth, { name: "setup_status", arguments: { setupId: setupInput.requestId } })).rejects.toMatchObject({ status: 404 });
    await expect(data.call(bob.auth, { name: "setup_status", arguments: { setupId: setupInput.requestId } })).rejects.toMatchObject({ status: 404 });
    const secret = "must-not-be-accepted";
    const invalid = await call("connection_setup", { ...setupInput, requestId: randomUUID(), apiKey: secret });
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain(secret);
    const saved = await call("source_text_create", { ...mutation(), text: "A new CV" });
    expect(saved.status).toBe(200);
    const [document] = await db.query<{ id: string }>(
      "SELECT id::text FROM candidate_documents WHERE user_node_id=$1 AND source_text='A new CV'", [alice.owner]);
    const denied = await call("source_parse", { ...mutation(), documentId: document.id, purpose: "career" });
    expect(denied.status).toBe(403);
    const [usage] = await db.query("SELECT count(*)::int AS count FROM mcp_usage_receipts");
    expect(usage.count).toBe(0);
  });

  it("permits an expired member to revoke availability but not opt back in", async () => {
    await activate();
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second'");
    const current = (await data.call(alice.auth, { name: "availability_read", arguments: {} })).structuredContent.data;
    const input = { requestId: randomUUID(), revision: current.revision, expectedVersion: current.expectedVersion, available: false };
    expect((await call("availability_set", input)).status).toBe(200);
    const saved = (await data.call(alice.auth, { name: "availability_read", arguments: {} })).structuredContent.data;
    expect(saved.available).toBe(false);
    const denied = await call("availability_set", {
      requestId: randomUUID(), revision: saved.revision, expectedVersion: saved.expectedVersion, available: true,
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toBeNull();
    expect((await data.call(alice.auth, { name: "availability_read", arguments: {} })).structuredContent.data.available).toBe(false);
  });

  it("shares persisted sources with the website while binding mutation retries to owner and grant", async () => {
    await activate();
    const input = { ...mutation(), text: "Maintained payment processing services", filename: "Original CV" };
    const first = await data.call(alice.auth, { name: "source_text_create", arguments: input });
    expect(await data.call(alice.auth, { name: "source_text_create", arguments: input })).toEqual(first);
    const documentId = first.structuredContent.data.id;
    const read = { name: "source_document_read", arguments: { documentId } };
    const mcp = await data.call(alice.auth, read);
    const session = await candidate.invoke({ kind: "session", owner: alice.owner, wallet: "alice" }, read.name, read.arguments);
    expect(mcp.structuredContent).toEqual(session);
    expect(mcp.structuredContent.data).toMatchObject({ id: documentId, text: input.text });
    await expect(data.call(bob.auth, read)).rejects.toMatchObject({ status: 400 });
    await expect(data.call(other.auth, { name: "source_text_create", arguments: input })).rejects.toMatchObject({ status: 409 });
    await expect(data.call(alice.auth, { name: "source_text_create", arguments: { ...input, text: "Different source" } })).rejects.toMatchObject({ status: 409 });
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second'");
    expect((await data.call(alice.auth, read)).structuredContent).toEqual(session);
    expect(await data.call(alice.auth, { name: "source_text_create", arguments: input })).toEqual(first);
    await expect(data.call(alice.auth, { name: "source_parse", arguments: { ...mutation(), documentId, purpose: "career" } })).rejects.toMatchObject({ status: 403 });
    await oauth.disconnect("alice", alice.grantId);
    await expect(data.call(alice.auth, read)).rejects.toMatchObject({ status: 401, response: { error: "invalid_token" } });
    const [saved] = await db.query("SELECT count(*)::int AS count FROM candidate_documents");
    expect(saved.count).toBe(1);
    const [usage] = await db.query("SELECT count(*)::int AS count FROM mcp_usage_receipts");
    expect(usage.count).toBe(0);
  });

  it("does not disclose a private result if authorization is revoked during its domain read", async () => {
    const original = career.career.bind(career);
    const reading = jest.spyOn(career, "career").mockImplementationOnce(async wallet => {
      const saved = await original(wallet);
      await oauth.disconnect("alice", alice.grantId);
      return saved;
    });
    try {
      const result = await call("source_document_list");
      expect(result.status).toBe(401);
      expect(await result.json()).toMatchObject({ error: "invalid_token" });
    } finally {
      reading.mockRestore();
    }
  });

  it("polls grant-bound saved career work without metering public searches or returning opaque events", async () => {
    await activate();
    const connectionId = randomUUID();
    await deviceConnectionFixture(db, "1", { id: connectionId, online: false });
    const input = { ...mutation(), connectionId, prompt: "Ask about my next career direction" };
    const started = await data.call(alice.auth, { name: "career_run", arguments: input });
    const requestId = started.structuredContent.data.requestId;
    expect((await data.call(alice.auth, { name: "career_run", arguments: input })).structuredContent).toEqual(started.structuredContent);
    for (const event of [{ type: "text", text: "Which direction interests you?", credential: "hidden-secret" }, { type: "tool", payload: "hidden-payload" }])
      await db.query("INSERT INTO candidate_agent_events(request_id,event) VALUES($1,$2)", [requestId, JSON.stringify(event)]);
    const request = { name: "career_result", arguments: { requestId } };
    const result = await data.call(alice.auth, request);
    expect(result.structuredContent.data).toMatchObject({ status: "waiting_for_device", events: expect.arrayContaining([expect.objectContaining({ event: { type: "text", text: "Which direction interests you?" } })]) });
    expect(JSON.stringify(result)).not.toContain("hidden-");
    expect(await data.call(alice.auth, request)).toEqual(result);
    await expect(data.call(other.auth, request)).rejects.toMatchObject({ status: 404 });
    await expect(data.call(bob.auth, request)).rejects.toMatchObject({ status: 404 });
    await oauth.disconnect("alice", alice.grantId);
    await expect(data.call(alice.auth, request)).rejects.toMatchObject({ status: 401 });
    const [usage] = await db.query("SELECT count(*)::int AS count FROM mcp_usage_receipts");
    expect(usage.count).toBe(0);
    const [queued] = await db.query("SELECT count(*)::int AS count FROM candidate_agent_requests");
    expect(queued.count).toBe(1);
  });

  it("keeps original public allowances and prevents another grant replaying their receipts", async () => {
    await activate();
    const legacy = await connect("alice", "data:read");
    expect((await data.tools(legacy.auth)).tools.map(tool => tool.name)).toEqual(["search_jobs", "search_organizations", "research_jobs", "research_result"]);
    const search = { name: "search_jobs", arguments: { requestId: randomUUID(), query: "payments", limit: 2 } };
    const first = await data.call(legacy.auth, search);
    expect(first.structuredContent.usage.units).toBe(1);
    const replay = await data.call(legacy.auth, search);
    expect(replay.structuredContent).toEqual(first.structuredContent);
    expect(jobs.getJobsListWithSearch).toHaveBeenCalledTimes(1);
    await expect(data.call(other.auth, search)).rejects.toMatchObject({ status: 409 });
    await data.call(alice.auth, { name: "search_organizations", arguments: { requestId: randomUUID() } });
    await expect(data.call(legacy.auth, { ...search, arguments: { ...search.arguments, requestId: randomUUID() } })).rejects.toMatchObject({ status: 429 });
    expect(jobs.getJobsListWithSearch).toHaveBeenCalledTimes(1);
    expect((await data.call(alice.auth, { name: "account_status", arguments: {} })).structuredContent.data.membership.advanced).toBe(true);
    expect(await data.status("alice")).toMatchObject({ usage: { used: 2, reserved: 0, unit: "calls" } });
  });
});
