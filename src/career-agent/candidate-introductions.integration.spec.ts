import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
import { CandidateInvocationContext } from "./candidate-context";
import { IntroductionSaveInput } from "./candidate-introductions.dto";
import { CandidateIntroductionService } from "./candidate-introductions.service";
import { CareerRepository } from "./career.repository";
import { CandidateNetworkRecommendation, IntroductionPath, NetworkService } from "./network.service";
import { deviceConnectionFixture, leaseDeviceRequestFixture } from "./device-execution.fixture";

const url = process.env.CAREER_TEST_DATABASE_URL ?? process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Candidate introduction drafts (isolated PostgreSQL)", () => {
  const schema = `introductions_${randomUUID().replace(/-/g, "")}`;
  let db: PostgresService, career: CareerRepository, network: NetworkService, introductions: CandidateIntroductionService;
  let worker: Extract<CandidateInvocationContext, { kind: "worker" }>;
  let applicationId: string, foreignApplicationId: string, otherApplicationId: string;
  let suggestion: CandidateNetworkRecommendation;
  const session: CandidateInvocationContext = { kind: "session", wallet: "alice", owner: "1" };
  const text = "Would you be open to discussing the backend role at Company A? I can share my CV if helpful.";

  beforeAll(async () => {
    const target = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) ||
      !["/career_agent_test", "/jobstash_hosted_career_test", "/jobstash_mcp_test", "/candidate_introductions_test"].includes(target.pathname))
      throw new Error("Use a dedicated local introduction test database");
    db = new PostgresService({ url: url!, applicationName: "candidate-introductions-tests", maxConnections: 8, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`
      CREATE TABLE graph_nodes(id bigserial PRIMARY KEY,label text NOT NULL,properties jsonb NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now());
      CREATE TABLE graph_relationships(id bigserial PRIMARY KEY,source_id bigint REFERENCES graph_nodes(id),target_id bigint REFERENCES graph_nodes(id),type text,relationship_key text,properties jsonb);
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),short_uuid text UNIQUE,payload jsonb,filter_labels jsonb,
        title text,organization_id text,project_id text,updated_at timestamptz DEFAULT now(),online boolean DEFAULT true,blocked boolean DEFAULT false,published_timestamp bigint);
      CREATE TABLE organization_search_documents(organization_node_id bigint REFERENCES graph_nodes(id),organization_id text,payload jsonb);
      CREATE TABLE user_activity_events(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),job_node_id bigint REFERENCES graph_nodes(id),event_type text);
      CREATE TABLE recommendation_embedding_documents(kind text,node_id bigint,status text,content_hash text);
      CREATE TABLE recommendation_sentence_embeddings(kind text,node_id bigint,text_hash text,sentence text,weight numeric);
      CREATE FUNCTION recommendation_embedding_content(text,bigint) RETURNS text LANGUAGE sql STABLE AS 'SELECT ''[]''::text';
      CREATE VIEW recommendation_embedding_inputs AS SELECT 'user'::text AS kind,id AS node_id,recommendation_embedding_content('user',id) AS content FROM graph_nodes WHERE label='User';
    `);
    for (const migration of ["career-agent", "career-agent-workflows", "career-agent-hosted", "career-agent-provider-api", "mcp-access", "candidate-capabilities", "candidate-introductions", "candidate-documents", "candidate-document-provenance", "candidate-device-execution", "candidate-voice"])
      await db.query(readFileSync(`scripts/sql/${migration}.sql`, "utf8"));
    career = new CareerRepository(db);
    network = new NetworkService(db, career, new ConfigService({ CAREER_CLICKHOUSE_URL: "", CAREER_DATA_PROTECTION_KEY: "11".repeat(32) }), {
      getUserById: async (id: string) => ({ linkedAccounts: [{ type: "github_oauth", subject: id, verifiedAt: new Date(), username: `${id}-root` }] }),
    } as never);
    introductions = new CandidateIntroductionService(db, career, network);
  });
  afterAll(async () => {
    if (db) { await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.onModuleDestroy(); }
  });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes,candidate_network_metadata,candidate_network_legacy_records,mcp_clients RESTART IDENTITY CASCADE");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES
      ('User','{"wallet":"alice","privyId":"alice"}'),('User','{"wallet":"bob","privyId":"bob"}'),
      ('Organization','{"orgId":"company-a"}'),('Organization','{"orgId":"company-b"}'),
      ('GitHubOrganization','{"login":"company-a"}'),('GitHubOrganization','{"login":"company-b"}'),
      ('StructuredJobpost','{"shortUUID":"job-a"}'),('StructuredJobpost','{"shortUUID":"job-b"}')`);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) VALUES(3,5,'HAS_GITHUB'),(4,6,'HAS_GITHUB')`);
    await db.query(`INSERT INTO organization_search_documents VALUES(3,'company-a','{"name":"Company A"}'),(4,'company-b','{"name":"Company B"}')`);
    await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,payload,filter_labels)
      VALUES(7,'job-a','company-a','{"title":"Backend engineer"}','{}'),(8,'job-b','company-b','{"title":"Backend engineer"}','{}')`);
    await db.query(`INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,status,paid_until)
      VALUES('alice-paid',1,'https://example.invalid','active',now()+interval '1 day'),('bob-paid',2,'https://example.invalid','active',now()+interval '1 day')`);
    applicationId = randomUUID(); foreignApplicationId = randomUUID(); otherApplicationId = randomUUID();
    await db.query(`INSERT INTO candidate_applications(id,user_node_id,job_node_id) VALUES($1,1,7),($2,2,7),($3,1,8)`,
      [applicationId, foreignApplicationId, otherApplicationId]);
    const connectionId = randomUUID(), sessionId = randomUUID();
    worker = { kind: "worker", owner: "1", wallet: "alice", workerId: randomUUID(), agentRequestId: randomUUID() };
    await deviceConnectionFixture(db, "1", { id: connectionId });
    await db.query(`INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id) VALUES($1,1,$2)`, [sessionId, connectionId]);
    await db.query(`INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt,status,worker_id,heartbeat_at)
      VALUES($1,$2,1,'Draft an introduction for this company','running',$3,now())`, [worker.agentRequestId, sessionId, worker.workerId]);
    await leaseDeviceRequestFixture(db, worker.agentRequestId, worker.workerId);
    for (const [owner, root] of [[1, "alice-root"], [2, "bob-root"]] as const) {
      for (const organizationId of ["company-a", "company-b"]) {
        const path: IntroductionPath = { people: [root, "first-contact", "intermediate-person", "target-person"], edges: [
          { organization: organizationId, from: root, to: "first-contact", caption: "Overlapping activity", asOf: "2026-01-01", repositories: ["private-repository-sentinel"] },
          { organization: organizationId, from: "first-contact", to: "intermediate-person", caption: "Overlapping activity", asOf: "2026-01-01", repositories: [] },
          { organization: organizationId, from: "intermediate-person", to: "target-person", caption: "Overlapping activity", asOf: "2026-01-01", repositories: [] },
        ] };
        await db.query(`INSERT INTO candidate_network_cache(user_node_id,organization_id,root,paths,expires_at)
          VALUES($1,$2,$3,$4,now()+interval '1 hour')`, [owner, organizationId, root, JSON.stringify([path])]);
      }
    }
    await db.query(`INSERT INTO candidate_network_metadata(login,contacts,annotations) VALUES('first-contact',
      '[{"kind":"email","value":"private-contact@example.invalid","source":"private-source"}]','[{"text":"private-admin-annotation"}]')`);
    suggestion = (await network.recommendations("alice", "company-a")).recommendations[0];
  });

  function input(extra: Partial<IntroductionSaveInput> = {}): IntroductionSaveInput {
    return { requestId: randomUUID(), revision: 0, organizationId: "company-a", suggestionId: suggestion.id, applicationId, text, ...extra };
  }
  async function saveAsWorker(value: IntroductionSaveInput) {
    return career.withCandidateInvocation(worker, "introduction_save", true, () =>
      career.withAgentEvent(worker.agentRequestId, "introduction", worker.workerId, () => introductions.save("alice", value)));
  }
  async function saveAsSession(value: IntroductionSaveInput) {
    return career.withCandidateInvocation(session, "introduction_update", true, () => introductions.save("alice", value));
  }

  it("persists only curated evidence for an owned canonical application and keeps other owners out", async () => {
    const value = input(), saved = await saveAsWorker(value);
    expect(saved).toMatchObject({ id: value.requestId, revision: 1, applicationId, text, evidenceStatus: "current", evidenceSnapshot: suggestion });
    const [persisted] = await db.query("SELECT evidence_snapshot FROM candidate_introduction_drafts WHERE id=$1", [saved.id]);
    expect(persisted.evidence_snapshot).toEqual(suggestion);
    const own = await introductions.read("alice", saved.id);
    expect(own.evidenceSnapshot?.firstContact.publicProfileUrl).toBe("https://github.com/first-contact");
    expect(JSON.stringify(own)).not.toMatch(/private-repository-sentinel|private-contact|private-admin-annotation|intermediate-person|target-person/);
    await expect(introductions.read("bob", saved.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await introductions.list("bob")).drafts).toEqual([]);
    await expect(career.withCandidateInvocation({ kind: "session", owner: "2", wallet: "bob" }, "introduction_update", true,
      () => introductions.save("bob", input({ id: saved.id, revision: 1 })))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("replays an identical mutation once, rejects changed input, and serializes versioned human edits", async () => {
    const value = input(), saved = await saveAsWorker(value);
    expect(await saveAsWorker(value)).toMatchObject({ id: saved.id, revision: 1, text });
    expect((await db.query("SELECT id FROM candidate_introduction_drafts")).map(row => row.id)).toEqual([saved.id]);
    expect((await db.query("SELECT mutation_id FROM candidate_agent_events")).map(row => row.mutation_id)).toEqual([value.requestId]);
    await expect(saveAsWorker({ ...value, text: "Different message" })).rejects.toBeInstanceOf(ConflictException);
    const edit = input({ id: saved.id, revision: 1, text: "My own reviewed message" });
    const results = await Promise.allSettled([saveAsSession(edit), saveAsSession({ ...edit, requestId: randomUUID(), text: "Competing edit" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    const current = await introductions.read("alice", saved.id);
    expect(current.revision).toBe(2);
    expect(["My own reviewed message", "Competing edit"]).toContain(current.text);
    await expect(saveAsSession(input({ id: saved.id, revision: 1 }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects foreign applications, cross-organization links, missing canonical jobs and foreign suggestions", async () => {
    await expect(saveAsWorker(input({ applicationId: foreignApplicationId }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(saveAsWorker(input({ applicationId: otherApplicationId }))).rejects.toBeInstanceOf(BadRequestException);
    const foreign = (await network.recommendations("bob", "company-a")).recommendations[0];
    await expect(saveAsWorker(input({ suggestionId: foreign.id }))).rejects.toBeInstanceOf(ConflictException);
    const other = (await network.recommendations("alice", "company-b")).recommendations[0];
    await expect(saveAsWorker(input({ suggestionId: other.id }))).rejects.toBeInstanceOf(ConflictException);
    await db.query("DELETE FROM job_search_documents WHERE job_node_id=7");
    await expect(saveAsWorker(input())).rejects.toBeInstanceOf(BadRequestException);
    expect(await db.query("SELECT id FROM candidate_introduction_drafts")).toEqual([]);
  });

  it.each(["first-contact", "intermediate-person"])("redacts suppressed %s from saved reads, pages and receipt replays and rejects another write", async login => {
    const value = input(), saved = await saveAsWorker(value);
    await db.query(`INSERT INTO candidate_network_metadata(login,suppressed) VALUES($1,true)
      ON CONFLICT(login) DO UPDATE SET suppressed=true`, [login]);
    const read = await introductions.read("alice", saved.id);
    expect(read).toMatchObject({ text, revision: 1, evidenceSnapshot: null, evidenceStatus: "unavailable" });
    expect((await introductions.list("alice")).drafts).toMatchObject([{ id: saved.id, text, evidenceSnapshot: null }]);
    expect(await saveAsWorker(value)).toMatchObject({ id: saved.id, text, evidenceSnapshot: null });
    await expect(saveAsSession(input({ id: saved.id, revision: 1, text: "Changed after suppression" }))).rejects.toBeInstanceOf(ConflictException);
    expect((await introductions.read("alice", saved.id)).text).toBe(text);
  });

  it("rechecks every route participant after discovery and before committing a draft", async () => {
    const recommendations = network.recommendations.bind(network);
    const changed = jest.spyOn(network, "recommendations").mockImplementationOnce(async (wallet, organizationId) => {
      const result = await recommendations(wallet, organizationId);
      await db.query("INSERT INTO candidate_network_metadata(login,suppressed) VALUES('intermediate-person',true)");
      return result;
    });
    try {
      await expect(saveAsWorker(input())).rejects.toBeInstanceOf(NotFoundException);
      expect(await db.query("SELECT id FROM candidate_introduction_drafts")).toEqual([]);
      expect(await db.query("SELECT request_id FROM candidate_mutations")).toEqual([]);
    } finally {
      changed.mockRestore();
    }
  });

  it("does not expose a saved contact when its target organization is suppressed", async () => {
    const saved = await saveAsWorker(input());
    await db.query(`INSERT INTO candidate_network_legacy_records(source_database,source_table,source_id,record,content_hash)
      VALUES('local-fixture','org_denylist','denied-company','{"pattern":"Company A"}','fixture')`);
    expect(await introductions.read("alice", saved.id)).toMatchObject({ text, evidenceSnapshot: null, evidenceStatus: "unavailable" });
    await expect(saveAsWorker(input())).rejects.toBeInstanceOf(NotFoundException);
  });

  it("preserves owned draft recovery while hiding evidence when the warehouse is unavailable or membership expires", async () => {
    const value = input(), saved = await saveAsWorker(value);
    await db.query("UPDATE candidate_network_cache SET expires_at=now()-interval '1 second'");
    const unavailable = await introductions.read("alice", saved.id);
    expect(unavailable).toMatchObject({ text, evidenceSnapshot: null, evidenceStatus: "unavailable" });
    await expect(saveAsWorker(input())).rejects.toBeInstanceOf(ConflictException);
    await db.query("UPDATE candidate_subscriptions SET status='expired',paid_until=now()-interval '1 second' WHERE user_node_id=1");
    expect(await introductions.read("alice", saved.id)).toMatchObject({ text, evidenceSnapshot: null });
    expect((await introductions.list("alice")).drafts.map(draft => draft.id)).toEqual([saved.id]);
    await expect(saveAsSession(input({ id: saved.id, revision: 1 }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(saveAsWorker(value)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects session creation, stale worker leases and direct OAuth edits, while allowing granted recovery reads", async () => {
    await expect(saveAsSession(input())).rejects.toBeInstanceOf(ForbiddenException);
    const value = input(), saved = await saveAsWorker(value);
    await db.query("UPDATE candidate_agent_requests SET heartbeat_at=now()-interval '1 minute'");
    await expect(saveAsWorker(value)).rejects.toBeInstanceOf(ConflictException);
    const clientId = randomUUID(), grantId = randomUUID();
    await db.query("INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,'Local introduction fixture','[]')", [clientId]);
    await db.query(`INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at)
      VALUES($1,1,$2,'http://localhost/mcp','career:read career:write',now()+interval '1 day')`, [grantId, clientId]);
    const oauth: CandidateInvocationContext = { kind: "oauth", wallet: "alice", owner: "1", clientId, grantId, scopes: ["career:read", "career:write"] };
    await expect(career.withCandidateInvocation(oauth, "introduction_update", true,
      () => introductions.save("alice", input({ id: saved.id, revision: 1 })))).rejects.toBeInstanceOf(ForbiddenException);
    expect(await career.withCandidateInvocation(oauth, "introduction_read", false,
      () => introductions.read("alice", saved.id))).toMatchObject({ id: saved.id, text });
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [grantId]);
    await expect(career.withCandidateInvocation(oauth, "introduction_read", false,
      () => introductions.read("alice", saved.id))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns stable bounded pages without crossing owners", async () => {
    const first = await saveAsWorker(input()), second = await saveAsWorker(input({ applicationId: undefined, text: "Another owned draft" }));
    const page = await introductions.list("alice", { limit: 1 });
    const next = await introductions.list("alice", { limit: 1, offset: 1 });
    expect(page.truncated).toBe(true);
    expect(next.truncated).toBe(false);
    expect(new Set([...page.drafts, ...next.drafts].map(draft => draft.id))).toEqual(new Set([first.id, second.id]));
    await expect(introductions.list("alice", { limit: 51 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
