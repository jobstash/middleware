import { ScreeningGovernanceService } from "./screening-governance.service";
import { ConfigService } from "@nestjs/config";
import * as Ajv from "ajv";
import { validate } from "class-validator";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
import { CandidateMatchingService } from "./candidate-matching.service";
import { candidateMatchingResultsSchema, CandidateMatchingRefreshInput, CandidateMatchingResultsInput } from "./candidate-matching.dto";
import { CareerRepository } from "./career.repository";
import { CvMatchService } from "./cv-match.service";
import { ScreeningService } from "./screening.service";
import { screeningMetrics } from "./job-screening";
import { openCareerData } from "./data-protection";
import { deviceConnectionFixture } from "./device-execution.fixture";
import { bindScreeningSourceFixture, candidateCapabilityFixture, screeningEvidenceFixture, screeningEligibilityFixture, screeningFitClaimsFixture } from "./screening.fixture";
import { persistScreeningJobFixture } from "./screening.integration.fixture";
import { installCandidateGeographyFixture, saveCandidateGeographyFixture } from "./candidate-geographic-eligibility.fixture";

const url = process.env.CAREER_TEST_DATABASE_URL ?? process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Candidate recommendations (persisted PostgreSQL)", () => {
  let db: PostgresService, career: CareerRepository, screening: ScreeningService, matching: CandidateMatchingService;
  let documentId: string, connectionId: string;
  const schema = `matching_${randomUUID().replace(/-/g, "")}`;
  const source = "Built TypeScript payment systems.";
  const preferences = { currentLocation: "Berlin, Germany", relocation: "not_open", destinations: "", notes: "" };
  const input = (extra: Partial<CandidateMatchingResultsInput> = {}): CandidateMatchingResultsInput => Object.assign(new CandidateMatchingResultsInput(), { documentId }, extra);
  const refreshInput = (extra: Partial<CandidateMatchingRefreshInput> = {}): CandidateMatchingRefreshInput => ({ ...input(), requestId: randomUUID(), revision: 0, ...extra });

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname) ||
      !["/career_agent_test", "/jobstash_hosted_career_test", "/jobstash_mcp_test", "/candidate_matching_test"].includes(parsed.pathname))
      throw new Error("A dedicated local test database is required");
    db = new PostgresService({ url: url!, applicationName: "candidate-matching-tests", maxConnections: 4, statementTimeoutMs: 10000 });
    const dataSource = db.getDataSource();
    dataSource.setOptions({ extra: { ...dataSource.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`
      CREATE TABLE graph_nodes(id bigserial PRIMARY KEY,label text,properties jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
      CREATE TABLE graph_relationships(id bigserial PRIMARY KEY,source_id bigint,target_id bigint,type text,relationship_key text,properties jsonb,UNIQUE(source_id,target_id,type,relationship_key));
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY,short_uuid text,title text,organization_id text,project_id text,
        payload jsonb,filter_labels jsonb,search_vector tsvector DEFAULT '',online boolean DEFAULT true,blocked boolean DEFAULT false,published_timestamp bigint DEFAULT (extract(epoch FROM now())*1000)::bigint,updated_at timestamptz DEFAULT now());
      CREATE TABLE organization_search_documents(organization_node_id bigint,organization_id text,payload jsonb);
      CREATE TABLE project_search_documents(project_node_id bigint,project_id text,payload jsonb);
      CREATE TABLE user_job_preferences(user_node_id bigint PRIMARY KEY,job_categories text[] DEFAULT '{}',industries text[] DEFAULT '{}',minimum_salary numeric,salary_currency text,work_authorization text,requires_sponsorship boolean,screening_location_preferences jsonb,residence_country text,utc_offset_minutes integer,updated_at timestamptz DEFAULT now());
      CREATE TABLE user_activity_events(id uuid DEFAULT gen_random_uuid(),user_node_id bigint,job_node_id bigint,event_type text,metadata jsonb DEFAULT '{}',dwell_ms integer,occurred_at timestamptz DEFAULT now());
      CREATE TABLE candidate_career_profiles(user_node_id bigint PRIMARY KEY,revision integer DEFAULT 0,directions text[] DEFAULT '{}',directions_updated_at timestamptz,evidence jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now());
      CREATE TABLE candidate_career_archetypes(id text,name text,classification text,requirements jsonb,sample_size integer,sampled_at timestamptz,source text);
      CREATE TABLE candidate_documents(id uuid PRIMARY KEY,user_node_id bigint,filename text,content_hash text,source_text text,parsed_result jsonb,embedding_node_id bigint,storage_kind text DEFAULT 'paste',created_at timestamptz DEFAULT now());
      CREATE TABLE candidate_parse_attempts(id uuid PRIMARY KEY,user_node_id bigint,document_id uuid,status text);
      CREATE TABLE candidate_application_documents(id uuid PRIMARY KEY,user_node_id bigint,content jsonb);
      CREATE TABLE recommendation_embedding_documents(kind text,node_id bigint,status text,version text,content_hash text);
      CREATE FUNCTION recommendation_embedding_content(text,bigint) RETURNS text LANGUAGE sql STABLE AS 'SELECT source_text FROM candidate_documents WHERE embedding_node_id=$2';
      CREATE TABLE candidate_cv_job_scores(document_id uuid,job_node_id bigint,score double precision,cv_hash text,job_hash text);
      CREATE TABLE candidate_applications(id uuid,job_node_id bigint,user_node_id bigint,revision integer,state jsonb);
      CREATE TABLE candidate_subscriptions(charge_id text PRIMARY KEY,user_node_id bigint,status text,paid_until timestamptz);
      CREATE TABLE candidate_ai_connections(id uuid PRIMARY KEY,user_node_id bigint,provider text,status text,generation integer NOT NULL DEFAULT 0,public_state jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
      CREATE TABLE candidate_mutations(user_node_id bigint,request_id uuid,input_hash text,response jsonb,PRIMARY KEY(user_node_id,request_id));
      CREATE TABLE candidate_agent_sessions(id uuid PRIMARY KEY,user_node_id bigint,connection_id uuid,object_kind text);
      CREATE TABLE candidate_agent_requests(id uuid PRIMARY KEY,session_id uuid,user_node_id bigint,prompt text,request_kind text,status text DEFAULT 'queued',worker_id uuid,heartbeat_at timestamptz,started_at timestamptz,finished_at timestamptz,oauth_grant_id uuid,oauth_client_id text,created_at timestamptz DEFAULT now());
      CREATE TABLE mcp_grants(id uuid PRIMARY KEY,user_node_id bigint,scope text,revoked_at timestamptz,expires_at timestamptz);
      CREATE TABLE candidate_agent_events(id bigserial,request_id uuid,event jsonb);
      CREATE TABLE candidate_screening_runs(id uuid PRIMARY KEY,user_node_id bigint,document_id uuid,connection_id uuid,cv_text text,cv_hash text,candidate_context text,rubric_hash text,model text,status text DEFAULT 'running',pause_reason text,oauth_grant_id uuid,oauth_client_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE UNIQUE INDEX one_running ON candidate_screening_runs(user_node_id) WHERE status='running';
      CREATE TABLE candidate_screening_jobs(id uuid PRIMARY KEY,run_id uuid,job_node_id bigint,short_uuid text,title text,company text,job_payload jsonb,job_text text,ad_hash text,additional_context text,ordinal integer,status text DEFAULT 'pending',assessment jsonb,assessment_at timestamptz,relationship_id bigint,original_ad_text text,previous_request_id uuid,request_id uuid,model text,reasoning_effort text,attempt_count integer DEFAULT 0,next_retry_at timestamptz,last_error text);
    `);
    for (const file of ["career-agent-hosted.sql", "career-agent-provider-api.sql", "candidate-model-selection.sql", "career-agent-screening-workflow.sql", "career-agent-screening-governance.sql", "candidate-document-provenance.sql", "candidate-device-execution.sql", "candidate-voice.sql"])
      await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
    await installCandidateGeographyFixture(db);
    career = new CareerRepository(db);
    screening = new ScreeningService(db, career, new ConfigService({ CAREER_DATA_PROTECTION_KEY: "ab".repeat(32) }), new ScreeningGovernanceService(db, career));
    matching = new CandidateMatchingService(db, career, new CvMatchService(db, career, undefined), screening);
  });
  afterAll(async () => {
    if (db) { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.onModuleDestroy(); }
  });
  beforeEach(async () => {
    await db.query(`TRUNCATE graph_nodes,graph_relationships,job_search_documents,organization_search_documents,
      user_job_preferences,user_activity_events,candidate_career_profiles,candidate_documents,candidate_cv_job_scores,
      candidate_applications,candidate_subscriptions,candidate_ai_connections,candidate_mutations,candidate_agent_sessions,
      candidate_agent_requests,candidate_agent_events,candidate_screening_runs,candidate_screening_jobs,job_work_location_options,job_availability_extractions RESTART IDENTITY CASCADE`);
    documentId = randomUUID(); connectionId = randomUUID();
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    await db.query(`INSERT INTO candidate_documents(id,user_node_id,filename,content_hash,source_text,embedding_node_id) VALUES($1,1,'CV.txt',$2,$3,1)`,
      [documentId, createHash("sha256").update(source).digest("hex"), source]);
    await bindScreeningSourceFixture(db, documentId);
    await db.query(`INSERT INTO candidate_career_profiles(user_node_id,directions,directions_updated_at) VALUES(1,ARRAY['BACKEND'],now())`);
    await db.query(`INSERT INTO user_job_preferences(user_node_id,job_categories,industries,minimum_salary,salary_currency,screening_location_preferences) VALUES(1,ARRAY['BACKEND'],ARRAY['Payments'],120000,'USD',$1)`, [JSON.stringify(preferences)]);
    await db.query(`INSERT INTO candidate_subscriptions VALUES('matching-paid',1,'active',now()+interval '1 day')`);
    await deviceConnectionFixture(db, "1", { id: connectionId });
  });

  async function job(name: string, classification = "BACKEND") {
    const [org] = await db.query<{ id: string }>(`INSERT INTO graph_nodes(label,properties) VALUES('Organization',jsonb_build_object('orgId',$1::text)) RETURNING id::text`, [name]);
    await db.query(`INSERT INTO organization_search_documents VALUES($1,$2,jsonb_build_object('name',$2::text))`, [org.id, name]);
    const [node] = await db.query<{ id: string }>(`INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost','{}') RETURNING id::text`);
    const [ad] = await db.query<{ id: string }>(`INSERT INTO graph_nodes(label,properties) VALUES('Jobpost','{"content":"Build TypeScript payment systems. Remote worldwide."}') RETURNING id::text`);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_STRUCTURED_JOBPOST')`, [ad.id, node.id]);
    await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,title,organization_id,payload,filter_labels,published_timestamp)
      VALUES($1,$2,$2,$2,jsonb_build_object('url','https://careers.example/'||$2::text,'location','Berlin','bounty',999999),jsonb_build_object('classifications',jsonb_build_object('class',$3::text)),extract(epoch FROM date_trunc('day',now()))*1000)`, [node.id, name, classification]);
    await saveCandidateGeographyFixture(db, node.id, ad.id);
    return { id: node.id, orgId: org.id, adId: ad.id };
  }
  function assessment(score = 85) {
    return {
      ...screeningEligibilityFixture("Build TypeScript payment systems.", true),
      ...screeningFitClaimsFixture(source, "Build TypeScript payment systems."),
      ...Object.fromEntries(screeningMetrics.map(metric => [metric, metric === "location_fit" && score < 90 ? 0 : score])),
      overall_score: score, evidence_coverage: score >= 90 ? 100 : 89, recommendation: "interview", recommendation_reason: "Relevant source evidence; employer constraints still need checking.",
      metric_assessments: screeningMetrics.map(metric => ({ metric, status: metric === "location_fit" && score < 90 ? "unknown" : "assessed", confidence: score >= 90 ? "high" : "medium",
        reason: "Original source comparison", supporting_evidence: metric === "location_fit" && score < 90 ? [] : [{ source: "candidate_cv", excerpt: source }, { source: "job_description", excerpt: "Build TypeScript payment systems." }], gaps_or_questions: [] })),
      seniority_comparison: { required_responsibility_scope: "Build systems", demonstrated_candidate_scope: "Built systems", material_difference: "Unknown ownership scope" },
      confirmed_hard_blockers: [], key_strengths: ["TypeScript systems"], critical_gaps: [], priority_validation_questions: ["Does the employer sponsor a visa?"],
    };
  }
  async function savedRun(scores: Array<[string, number, string?]>) {
    for (const [name, , classification] of scores) await job(name, classification);
    const result = await matching.refresh("alice", refreshInput());
    const id = result.run!.id;
    const scoreByJob: Record<string, number> = Object.fromEntries(scores.map(([name, score]) => [name, score]));
    const jobs = await db.query<{ id: string; short_uuid: string; job_text: string; additional_context: string; candidate_cv: string }>(`SELECT j.id,j.short_uuid,j.job_text,j.additional_context,r.candidate_cv
      FROM candidate_screening_jobs j JOIN candidate_screening_runs r ON r.id=j.run_id WHERE j.run_id=$1`, [id]);
    const rows = jobs.map(job => ({
      id: job.id, capability_id: randomUUID(),
      evidence_session: randomUUID(), evidence_request: randomUUID(),
      capability_session: randomUUID(), capability_request: randomUUID(),
      fit_session: randomUUID(), fit_request: randomUUID(),
      evidence: screeningEvidenceFixture(job.candidate_cv, job.job_text),
      capability: candidateCapabilityFixture(job.candidate_cv),
      assessment: assessmentForContext(job.additional_context, scoreByJob[job.short_uuid]),
    }));
    // Ranking fixtures are complete saved observations; transition tests below drive the scheduler itself.
    await db.query(`WITH fixture AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,capability_id uuid,
        evidence_session uuid,evidence_request uuid,capability_session uuid,capability_request uuid,
        fit_session uuid,fit_request uuid,evidence jsonb,capability jsonb,assessment jsonb)
    ), stages AS MATERIALIZED (
      SELECT x.id,stage.* FROM fixture x CROSS JOIN LATERAL (VALUES
        (x.evidence_session,x.evidence_request,'evidence',x.evidence),
        (x.capability_session,x.capability_request,'capability',x.capability),
        (x.fit_session,x.fit_request,'fit',x.assessment)) stage(session_id,request_id,stage,artifact)
    ), sessions AS (
      INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id,object_kind)
      SELECT s.session_id,r.user_node_id,r.connection_id,'screening_job' FROM stages s
      CROSS JOIN candidate_screening_runs r WHERE r.id=$1 RETURNING id
    ), requests AS (
      INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt,request_kind,status,requested_model,requested_reasoning_effort,finished_at)
      SELECT s.request_id,s.session_id,r.user_node_id,'Saved screening fixture: '||s.stage,'screening','completed',r.model,r.reasoning_effort,now()
      FROM stages s JOIN sessions session ON session.id=s.session_id CROSS JOIN candidate_screening_runs r WHERE r.id=$1 RETURNING id
    ), bindings AS (
      INSERT INTO candidate_screening_stage_requests(request_id,job_id,stage,artifact,saved_at)
      SELECT s.request_id,s.id,s.stage,s.artifact,now() FROM stages s JOIN requests request ON request.id=s.request_id RETURNING job_id
    ), capabilities AS (
      INSERT INTO candidate_screening_capabilities(id,user_node_id,document_id,cv_hash,provenance_hash,function_key,rubric_hash,policy_version,model,reasoning_effort,cache_key,assessment,request_id)
      SELECT x.capability_id,r.user_node_id,r.document_id,r.cv_hash,r.provenance_hash,'engineering',r.rubric_hash,r.policy_snapshot->>'version',
        r.model,r.reasoning_effort,x.capability_id::text,x.capability,x.capability_request
      FROM fixture x JOIN requests request ON request.id=x.capability_request CROSS JOIN candidate_screening_runs r WHERE r.id=$1 RETURNING id
    ) UPDATE candidate_screening_jobs j SET status='completed',current_stage='fit',assessment=x.assessment,assessment_at=now(),
      evidence=x.evidence,capability_id=cap.id,request_id=x.fit_request
      FROM fixture x JOIN capabilities cap ON cap.id=x.capability_id WHERE j.id=x.id`, [id, JSON.stringify(rows)]);
    await db.query(`UPDATE candidate_screening_runs SET status='completed' WHERE id=$1`, [id]);
    return id;
  }

  function assessmentForContext(context: string, score = 85) {
    const value = assessment(score);
    const location = JSON.parse(context).candidate_preferences.candidate_source_location;
    value.practical_eligibility.candidate.current_location = location.currentLocation;
    value.practical_eligibility.candidate.relocation = location.relocation ?? "unknown";
    value.practical_eligibility.candidate.evidence = location.relocation
      ? [{ source: "additional_context", excerpt: JSON.stringify(location.relocation) }] : [];
    return value;
  }
  async function persistNext(runId: string, afterSave?: Parameters<typeof persistScreeningJobFixture>[4]) {
    return persistScreeningJobFixture(db, screening, runId, request =>
      assessmentForContext(request.additional_context), afterSave);
  }

  it("ranks all persisted shortlisted assessments before paging", async () => {
    await savedRun([["low", 70], ["adjacent", 89], ["chosen", 90], ["middle", 80]]);
    const first = await matching.results("alice", input({ limit: 2 }));
    expect(first.jobs.map(j => j.shortUUID)).toEqual(["chosen", "adjacent"]);
    expect(first.total).toBe(4);
    expect(first.hasMore).toBe(true);
    expect((await matching.results("alice", input({ offset: 2, limit: 2 }))).jobs.map(j => j.shortUUID)).toEqual(["middle", "low"]);
    expect(first.jobs[0].evidence.find(e => e.dimension === "technical_fit")).toMatchObject({ status: "supported", excerpts: [{ source: "candidate_cv", excerpt: source }, { source: "job_description", excerpt: "Build TypeScript payment systems." }] });
    expect(first.jobs[0]).not.toHaveProperty("bounty");
  });

  it("filters inclusive saved evaluation scores before pagination and leaves unscored jobs last", async () => {
    const runId = await savedRun([["zero", 0], ["low", 25], ["tie-a", 50], ["tie-b", 50], ["perfect", 100], ["unknown", 100]]);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{evidence_coverage}','0') WHERE short_uuid='unknown'`);
    const descending = await matching.results("alice", input({ runId, sort: "score-desc" }));
    expect(descending.jobs.map(j => [j.shortUUID, j.score])).toEqual([
      ["perfect", 100], ["tie-a", 50], ["tie-b", 50], ["low", 25], ["zero", 0], ["unknown", null],
    ]);
    expect((await matching.results("alice", input({ runId, sort: "score-asc" }))).jobs.map(j => j.shortUUID))
      .toEqual(["zero", "low", "tie-a", "tie-b", "perfect", "unknown"]);
    for (const sort of ["score-desc", "score-asc"] as const) {
      const expected = sort === "score-desc" ? ["perfect", "tie-a", "tie-b", "low", "zero"] : ["zero", "low", "tie-a", "tie-b", "perfect"];
      for (let offset = 0; offset < expected.length; offset++) {
        const page = await matching.results("alice", input({ runId, sort, minScore: 0, maxScore: 100, offset, limit: 1 }));
        expect(page).toMatchObject({ total: 5, unfilteredTotal: 6, hasMore: offset < 4 });
        expect(page.jobs.map(j => j.shortUUID)).toEqual([expected[offset]]);
      }
    }
    for (const score of [0, 100]) {
      const exact = await matching.results("alice", input({ runId, minScore: score, maxScore: score }));
      expect(exact.jobs.map(j => j.score)).toEqual([score]);
      expect(exact).toMatchObject({ total: 1, unfilteredTotal: 6, hasMore: false });
    }
    const bounded = await matching.results("alice", input({ runId, minScore: 25, maxScore: 50, offset: 1, limit: 1 }));
    expect(bounded).toMatchObject({ total: 3, unfilteredTotal: 6, hasMore: true });
    expect(bounded.jobs.map(j => j.shortUUID)).toEqual(["tie-b"]);
    for (const bounds of [{ minScore: 0 }, { maxScore: 100 }])
      expect((await matching.results("alice", input({ runId, ...bounds }))).jobs.map(j => j.shortUUID)).not.toContain("unknown");
    expect(await matching.results("alice", input({ runId, minScore: 25, maxScore: 50, offset: 100 })))
      .toMatchObject({ jobs: [], total: 3, unfilteredTotal: 6, hasMore: false, status: "ready" });
    expect(await matching.results("alice", input({ runId, minScore: 51, maxScore: 99 })))
      .toMatchObject({ jobs: [], total: 0, unfilteredTotal: 6, hasMore: false, status: "ready" });
  });

  it("rejects invalid score queries at schema, DTO and direct service boundaries", async () => {
    const schemaValidate = new Ajv().compile(candidateMatchingResultsSchema);
    const invalid = [
      { sort: "score" }, { sort: null }, { minScore: -1 }, { maxScore: 101 }, { minScore: 0.5 },
      { maxScore: "50" }, { minScore: null }, { maxScore: null },
    ];
    for (const query of invalid) {
      const args = input(query as Partial<CandidateMatchingResultsInput>);
      expect(schemaValidate(args)).toBe(false);
      expect(await validate(args)).not.toEqual([]);
      await expect(matching.results("alice", args)).rejects.toThrow();
    }
    const inverted = input({ minScore: 80, maxScore: 20 });
    expect(await validate(inverted)).not.toEqual([]);
    await expect(matching.results("alice", inverted)).rejects.toThrow("minScore must not exceed maxScore");
    for (const query of [{}, { minScore: 0, maxScore: 100 }, { minScore: 50, maxScore: 50 }, { sort: "score-asc", maxScore: 0 }]) {
      const args = input(query as Partial<CandidateMatchingResultsInput>);
      expect(schemaValidate(args)).toBe(true);
      expect(await validate(args)).toEqual([]);
    }
  });

  it("makes every eligible interview accessible across deterministic pages while excluding rejections and confirmed blockers", async () => {
    const names = Array.from({ length: 107 }, (_, index) => `interview-${String(index).padStart(3, "0")}`);
    const runId = await savedRun([...names.map((name, index): [string, number] => [name, 100 - Math.floor(index / 4)]), ["rejected", 100], ["hard-blocker", 100]]);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{recommendation}','"reject"') WHERE short_uuid='rejected'`);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{confirmed_hard_blockers}','["Required security clearance is explicitly unmet."]') WHERE short_uuid='hard-blocker'`);
    const first = await matching.results("alice", input({ runId }));
    expect(first.jobs).toHaveLength(50);
    expect(first.total).toBe(107);
    expect(first.hasMore).toBe(true);
    const ids = first.jobs.map(j => j.shortUUID);
    let page = first;
    while (page.hasMore) {
      page = await matching.results("alice", input({ runId, offset: page.offset + page.limit }));
      ids.push(...page.jobs.map(j => j.shortUUID));
    }
    expect(page.jobs).toHaveLength(7);
    expect(ids).toEqual(names);
    expect(new Set(ids).size).toBe(107);
    expect((await matching.results("alice", input({ runId, limit: 100 }))).jobs.map(j => j.shortUUID)).toEqual(names.slice(0, 100));
    expect((await matching.results("alice", input({ runId, offset: 50 }))).jobs.map(j => j.shortUUID)).toEqual(names.slice(50, 100));
  });

  it("allows offsets beyond 10000 without allowing unsafe offsets or oversized transport pages", async () => {
    await savedRun([["eligible", 85]]);
    expect(await matching.results("alice", input({ offset: 10001 }))).toMatchObject({ jobs: [], total: 1, offset: 10001, hasMore: false });
    expect(await matching.results("alice", input({ offset: Number.MAX_SAFE_INTEGER }))).toMatchObject({ jobs: [], hasMore: false });
    for (const offset of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(matching.results("alice", input({ offset }))).rejects.toThrow("safe-integer offset");
    for (const limit of [0, 101, 1.5])
      await expect(matching.results("alice", input({ limit }))).rejects.toThrow("limit 1–100");
  });

  it("publishes the first interview immediately and updates decision counts while the run remains active", async () => {
    const runId = await savedRun([["first", 90], ["second", 80], ["reject", 70], ["unavailable", 0], ["failed", 0]]);
    await db.query(`UPDATE candidate_screening_runs SET status='running' WHERE id=$1`, [runId]);
    await db.query(`UPDATE candidate_screening_jobs SET status='pending' WHERE short_uuid IN ('second','reject')`);
    await db.query(`UPDATE candidate_screening_jobs SET status='unavailable',assessment=NULL WHERE short_uuid='unavailable'`);
    await db.query(`UPDATE candidate_screening_jobs SET status='failed',assessment=NULL WHERE short_uuid='failed'`);
    const first = await matching.results("alice", input({ runId }));
    expect(first.status).toBe("ready");
    expect(first.jobs.map(j => j.shortUUID)).toEqual(["first"]);
    expect(first.run).toMatchObject({ status: "running", availability: "waiting_for_device", active: 0, total: 5, assessed: 1, interview: 1, rejected: 0, unavailable: 1, failed: 1 });
    expect(first.nextActions).toContainEqual(expect.objectContaining({ operation: "recommendations_results" }));
    const hidden = await matching.results("alice", input({ runId, maxScore: 0 }));
    expect(hidden).toMatchObject({ jobs: [], total: 0, unfilteredTotal: 1, status: "ready" });
    expect(hidden.run).toEqual(first.run);
    expect(hidden.search).toEqual(first.search);
    expect(hidden.nextActions).toEqual(first.nextActions);
    await db.query(`UPDATE candidate_screening_jobs SET status='completed' WHERE short_uuid='second'`);
    await db.query(`UPDATE candidate_screening_jobs SET status='completed',assessment=jsonb_set(assessment,'{recommendation}','"reject"') WHERE short_uuid='reject'`);
    const next = await matching.results("alice", input({ runId }));
    expect(next.jobs.map(j => j.shortUUID)).toEqual(["first", "second"]);
    expect(next.total).toBe(2);
    expect(next.run).toMatchObject({ status: "running", assessed: 3, interview: 2, rejected: 1, unavailable: 1, failed: 1 });
  });

  it("reports full-run progress without counting retryable or exhausted failures as processed", async () => {
    expect((await matching.results("alice", input())).search).toEqual({
      total: 0, processed: 0, remaining: 0, failed: 0, unavailable: 0, newJobs: 0,
    });
    const runId = await savedRun([
      ["interview", 90], ["reject", 80], ["pending", 0], ["running", 0],
      ["retry", 0], ["exhausted", 0], ["unavailable", 0],
    ]);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{recommendation}','"reject"') WHERE short_uuid='reject'`);
    await db.query(`UPDATE candidate_screening_jobs SET status=short_uuid,assessment=NULL WHERE short_uuid IN ('pending','running','unavailable')`);
    await db.query(`UPDATE candidate_screening_jobs SET status='failed',assessment=NULL,
      attempt_count=CASE WHEN short_uuid='retry' THEN 1 ELSE 2 END,next_retry_at=now()+interval '1 minute'
      WHERE short_uuid IN ('retry','exhausted')`);
    await job("arrival");
    const result = await matching.results("alice", input({ runId, offset: 100 }));
    expect(result.jobs).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.search).toEqual({ total: 7, processed: 2, remaining: 3, failed: 1, unavailable: 1, newJobs: 1 });
    expect((await matching.results("alice", input({ runId, limit: 1 }))).search).toEqual(result.search);
    expect(await db.query("SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')")).toEqual([]);
  });

  it("appends arrivals to an active run without replacing completed reviews or queued request identities", async () => {
    await job("a-reviewed"); await job("b-inflight"); await job("c-pending");
    const started = await matching.refresh("alice", refreshInput({ searchGoal: "TypeScript ownership" }));
    const runId = started.run!.id;
    await persistNext(runId);
    await db.transaction(manager => screening.enqueue(manager));
    const original = await db.query<{ additional_context: string }>(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId]);
    const originalRequests = await db.query(`SELECT id,status FROM candidate_agent_requests ORDER BY id`);
    const [pinned] = await db.query(`SELECT cv_hash,cv_text,connection_id,model FROM candidate_screening_runs WHERE id=$1`, [runId]);
    await job("d-arrival");
    expect((await matching.results("alice", input({ runId }))).search.newJobs).toBe(1);
    const result = await matching.refresh("alice", refreshInput({ mode: "append", runId }));
    expect(result.run).toMatchObject({ id: runId, status: "running" });
    expect(result.search).toEqual({ total: 4, processed: 1, remaining: 3, failed: 0, unavailable: 0, newJobs: 0 });
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid<>'d-arrival' ORDER BY ordinal`, [runId])).toEqual(original);
    expect(await db.query(`SELECT cv_hash,cv_text,connection_id,model FROM candidate_screening_runs WHERE id=$1`, [runId])).toEqual([pinned]);
    const [added] = await db.query<{ ordinal: number; context: { candidate_preferences: unknown } }>(`SELECT ordinal,additional_context::jsonb AS context FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid='d-arrival'`, [runId]);
    expect(added.ordinal).toBe(3);
    expect(added.context.candidate_preferences).toEqual(JSON.parse(original[0].additional_context).candidate_preferences);
    const [snapshot] = await db.query(`SELECT candidate_context::jsonb#>'{shortlist,jobIds}' AS ids FROM candidate_screening_runs WHERE id=$1`, [runId]);
    const ids = await db.query(`SELECT job_node_id::text AS id FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId]);
    expect(snapshot.ids).toEqual(ids.map(row => row.id));
    expect(await db.query(`SELECT id,status FROM candidate_agent_requests ORDER BY id`)).toEqual(originalRequests);
  });

  it("appends after completion once under concurrent requests and replays without capturing later arrivals", async () => {
    const runId = await savedRun([["reviewed", 90]]);
    const [review] = await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1`, [runId]);
    await job("arrival");
    const request = refreshInput({ mode: "append", runId });
    const responses = await Promise.all([
      matching.refresh("alice", request), matching.refresh("alice", request),
      matching.refresh("alice", refreshInput({ mode: "append", runId })),
    ]);
    for (const response of responses) {
      expect(response.run).toMatchObject({ id: runId, status: "running" });
      expect(response.search).toEqual({ total: 2, processed: 1, remaining: 1, failed: 0, unavailable: 0, newJobs: 0 });
    }
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE id=$1`, [review.id])).toEqual([review]);
    await job("later");
    const replayed = await matching.refresh("alice", request);
    expect(replayed.search).toEqual({ total: 2, processed: 1, remaining: 1, failed: 0, unavailable: 0, newJobs: 1 });
    expect(await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId]))
      .toEqual([{ short_uuid: "reviewed" }, { short_uuid: "arrival" }]);
    expect(await db.query(`SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')`)).toEqual([]);
    expect(await db.query(`SELECT id FROM candidate_screening_runs`)).toEqual([{ id: runId }]);
  });

  it("deduplicates new identities against completed, pending and historical employer/ATS snapshots on read-only polls", async () => {
    const runId = await savedRun([["reviewed", 90], ["queued", 80]]);
    await db.query(`UPDATE candidate_screening_jobs SET status='pending',assessment=NULL WHERE short_uuid='queued'`);
    await db.query(`UPDATE candidate_screening_runs SET status='running' WHERE id=$1`, [runId]);
    for (const name of ["reviewed-copy", "queued-copy", "fresh", "fresh-copy", "different-query", "other-employer"])
      await job(name);
    await db.query(`UPDATE job_search_documents SET organization_id='reviewed',payload=jsonb_set(payload,'{url}','"https://careers.example/reviewed#apply"') WHERE short_uuid='reviewed-copy'`);
    await db.query(`UPDATE job_search_documents SET organization_id='queued',payload=jsonb_set(payload,'{url}','"https://careers.example/queued"') WHERE short_uuid='queued-copy'`);
    await db.query(`UPDATE job_search_documents SET organization_id='fresh',payload=jsonb_set(payload,'{url}','"https://careers.example/fresh#apply"') WHERE short_uuid='fresh-copy'`);
    await db.query(`UPDATE job_search_documents SET organization_id='fresh',payload=jsonb_set(payload,'{url}','"https://careers.example/fresh?job=2"') WHERE short_uuid='different-query'`);
    await db.query(`UPDATE job_search_documents SET payload=jsonb_set(payload,'{url}','"https://careers.example/fresh"') WHERE short_uuid='other-employer'`);
    // A selected document disappearing does not make its replacement ATS ad new.
    await db.query(`DELETE FROM job_search_documents WHERE short_uuid='reviewed'`);
    const original = await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId]);
    const runs = await db.query(`SELECT * FROM candidate_screening_runs ORDER BY id`);
    const mutations = await db.query(`SELECT * FROM candidate_mutations ORDER BY request_id`);
    for (let poll = 0; poll < 3; poll++)
      expect((await matching.results("alice", input({ runId }))).search.newJobs).toBe(3);
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId])).toEqual(original);
    expect(await db.query(`SELECT * FROM candidate_screening_runs ORDER BY id`)).toEqual(runs);
    expect(await db.query(`SELECT * FROM candidate_mutations ORDER BY request_id`)).toEqual(mutations);
    expect(await db.query(`SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')`)).toEqual([]);
    const appended = await matching.refresh("alice", refreshInput({ mode: "append", runId }));
    expect(appended.search).toEqual({ total: 5, processed: 1, remaining: 4, failed: 0, unavailable: 0, newJobs: 0 });
    expect(await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY short_uuid`, [runId]))
      .toEqual(["different-query", "fresh", "other-employer", "queued", "reviewed"].map(short_uuid => ({ short_uuid })));
  });

  it("counts only relevant live arrivals and rechecks ignored companies both at append and before execution", async () => {
    const runId = await savedRun([["reviewed", 90]]);
    const ignored = await job("ignored"), applied = await job("applied"), dismissed = await job("dismissed");
    await job("offline"); await job("unrelated", "SALES"); await job("future");
    const localOnly = await job("wrong-residency");
    await db.query(`UPDATE job_work_location_options SET residency_requirements=ARRAY['United States'] WHERE raw_job_node_id=$1`, [localOnly.adId]);
    await db.query(`UPDATE job_search_documents SET online=false WHERE short_uuid='offline'`);
    await db.query(`UPDATE job_search_documents SET published_timestamp=extract(epoch FROM now()+interval '1 day')*1000 WHERE short_uuid='future'`);
    await db.query(`INSERT INTO user_activity_events(user_node_id,job_node_id,event_type) VALUES(1,$1,'job_apply'),(1,$2,'job_dismiss')`, [applied.id, dismissed.id]);
    const kept = await job("kept");
    expect((await matching.results("alice", input({ runId }))).search.newJobs).toBe(2);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) VALUES(1,$1,'BLOCKED_ORG_JOBS')`, [ignored.orgId]);
    const result = await matching.refresh("alice", refreshInput({ mode: "append", runId }));
    expect(result.search).toEqual({ total: 2, processed: 1, remaining: 1, failed: 0, unavailable: 0, newJobs: 0 });
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) VALUES(1,$1,'BLOCKED_ORG_JOBS')`, [kept.orgId]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT short_uuid,status FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY short_uuid`, [runId]))
      .toEqual([{ short_uuid: "kept", status: "unavailable" }, { short_uuid: "reviewed", status: "completed" }]);
    expect(await db.query(`SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')`)).toEqual([]);
  });

  it("resumes and appends a user-paused run without resetting exhausted failures", async () => {
    const runId = await savedRun([["reviewed", 90], ["pending", 0], ["retry", 0], ["exhausted", 0]]);
    await db.query(`UPDATE candidate_screening_jobs SET status='pending',assessment=NULL WHERE short_uuid='pending'`);
    await db.query(`UPDATE candidate_screening_jobs SET status='failed',assessment=NULL,
      attempt_count=CASE WHEN short_uuid='retry' THEN 1 ELSE 2 END,next_retry_at=now()+interval '1 minute'
      WHERE short_uuid IN ('retry','exhausted')`);
    await screening.control("alice", runId, "pause");
    const original = await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId]);
    await job("arrival");
    const result = await matching.refresh("alice", refreshInput({ mode: "append", runId }));
    expect(result.run).toMatchObject({ id: runId, status: "running", autoResumeAt: null });
    expect(result.search).toEqual({ total: 5, processed: 1, remaining: 3, failed: 1, unavailable: 0, newJobs: 0 });
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid<>'arrival' ORDER BY ordinal`, [runId])).toEqual(original);
  });

  it("rejects append during a provider-capacity wait without changing queue, timer or completed work", async () => {
    await job("initial");
    const started = await matching.refresh("alice", refreshInput());
    const runId = started.run!.id;
    await db.transaction(manager => screening.enqueue(manager));
    await db.query(`UPDATE candidate_agent_requests SET status='paused'`);
    await job("arrival");
    await expect(matching.refresh("alice", refreshInput({ mode: "append", runId })))
      .rejects.toMatchObject({ response: { code: "search_capacity_wait" } });
    await db.transaction(manager => screening.enqueue(manager));
    const before = await db.query(`SELECT * FROM candidate_screening_runs WHERE id=$1`, [runId]);
    const queue = await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1`, [runId]);
    await expect(matching.refresh("alice", refreshInput({ mode: "append", runId })))
      .rejects.toMatchObject({ response: { code: "search_capacity_wait" } });
    expect(await db.query(`SELECT * FROM candidate_screening_runs WHERE id=$1`, [runId])).toEqual(before);
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1`, [runId])).toEqual(queue);
    expect((await matching.results("alice", input({ runId }))).search.newJobs).toBe(1);
    await screening.control("alice", runId, "pause");
    expect((await matching.results("alice", input({ runId }))).run!.autoResumeAt).toBeNull();
  });

  it("rejects missing, foreign or changed append context without modifying the selected run", async () => {
    const runId = await savedRun([["reviewed", 90]]);
    await job("arrival");
    const original = await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1`, [runId]);
    await expect(matching.refresh("alice", refreshInput({ mode: "append" }))).rejects.toThrow("runId");
    await db.query(`INSERT INTO candidate_subscriptions VALUES('bob-paid',2,'active',now()+interval '1 day')`);
    await expect(matching.refresh("bob", refreshInput({ mode: "append", runId }))).rejects.toThrow("Assessment run not found");
    await expect(matching.refresh("alice", refreshInput({ mode: "append", runId, documentId: randomUUID() }))).rejects.toThrow("Assessment run not found");
    for (const change of [{ revision: 1 }, { connectionId: randomUUID() }, { searchGoal: "Change the search" }])
      await expect(matching.refresh("alice", refreshInput({ mode: "append", runId, ...change })))
        .rejects.toMatchObject({ response: { code: "search_context_changed" } });
    await db.query(`UPDATE candidate_documents SET source_text='Changed CV' WHERE id=$1`, [documentId]);
    await expect(matching.refresh("alice", refreshInput({ mode: "append", runId })))
      .rejects.toMatchObject({ response: { code: "search_context_changed" } });
    await db.query(`UPDATE candidate_documents SET source_text=$2 WHERE id=$1`, [documentId, source]);
    await db.query(`UPDATE user_job_preferences SET minimum_salary=180000 WHERE user_node_id=1`);
    await expect(matching.refresh("alice", refreshInput({ mode: "append", runId })))
      .rejects.toMatchObject({ response: { code: "search_context_changed" } });
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1`, [runId])).toEqual(original);
    expect(await db.query(`SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')`)).toEqual([]);
  });


  it("pins an appended job to the historical assessment model and completes all newly selected work", async () => {
    await db.query(`UPDATE candidate_ai_connections SET provider='codex',public_state=public_state||'{"model":"gpt-5.6-terra","reasoningEffort":"low"}'::jsonb WHERE id=$1`, [connectionId]);
    await job("reviewed");
    const started = await matching.refresh("alice", refreshInput());
    const runId = started.run!.id;
    await persistNext(runId);
    const [reviewed] = await db.query(`SELECT * FROM candidate_screening_jobs WHERE run_id=$1`, [runId]);
    await db.query(`UPDATE candidate_ai_connections SET public_state=public_state||'{"model":"gpt-6-astra","reasoningEffort":"high"}'::jsonb WHERE id=$1`, [connectionId]);
    await job("arrival");
    await matching.refresh("alice", refreshInput({ mode: "append", runId }));
    await persistNext(runId);
    await db.transaction(manager => screening.enqueue(manager));
    const result = await matching.results("alice", input({ runId }));
    expect(result.run).toMatchObject({ id: runId, status: "completed" });
    expect(result.search).toEqual({ total: 2, processed: 2, remaining: 0, failed: 0, unavailable: 0, newJobs: 0 });
    expect(result.jobs.find(job => job.shortUUID === "arrival")!.context).toMatchObject({ model: "gpt-5.6-terra", reasoningEffort: "low" });
    expect(await db.query(`SELECT * FROM candidate_screening_jobs WHERE id=$1`, [reviewed.id])).toEqual([reviewed]);
    expect(await db.query(`SELECT stage.stage,request.requested_model,request.requested_reasoning_effort,request.status
      FROM candidate_screening_jobs job JOIN candidate_screening_stage_requests stage ON stage.job_id=job.id
      JOIN candidate_agent_requests request ON request.id=stage.request_id
      WHERE job.run_id=$1 AND job.short_uuid='arrival' ORDER BY stage.created_at`, [runId]))
      .toEqual(["evidence", "fit"].map(stage => ({
        stage, requested_model: "gpt-5.6-terra", requested_reasoning_effort: "low", status: "completed",
      })));
    expect(await db.query(`SELECT capability_id FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid='arrival'`, [runId]))
      .toEqual([{ capability_id: reviewed.capability_id }]);
  });

  it("aggregates recommended roles across pages without turning rejected-role requirements into CV advice", async () => {
    const runId = await savedRun([["first", 90], ["second", 80], ["rejected", 70], ["removed", 75], ["reclassified", 80]]);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{requirements}',
      '[{\"requirement\":\"Production TypeScript ownership\",\"kind\":\"skill\",\"priority\":\"must_have\",\"state\":\"unknown\",\"candidate_scope\":\"unknown\",\"job_evidence\":[{\"source\":\"job_description\",\"excerpt\":\"Build TypeScript payment systems.\"}],\"candidate_evidence\":[]}]') WHERE run_id=$1`, [runId]);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{recommendation}','\"reject\"') WHERE short_uuid='rejected'`);
    await db.query(`UPDATE candidate_screening_runs SET candidate_context=jsonb_set(candidate_context::jsonb,'{shortlist,jobIds}',
      (SELECT jsonb_agg(job_node_id::text) FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid<>'removed'))::text WHERE id=$1`, [runId]);
    await db.query(`UPDATE job_search_documents SET filter_labels='{"classifications":{"class":"SALES"}}' WHERE short_uuid='reclassified'`);
    const first = await matching.results("alice", input({ runId, limit: 1 }));
    expect(first.jobs.map(item => item.shortUUID)).toEqual(["first"]);
    expect(first.cvImprovements).toMatchObject({ status: "complete", reviewedJobs: 2 });
    expect(first.cvImprovements.items[0]).toMatchObject({ kind: "cv_detail", jobs: 2 });
    expect(first.cvImprovements.items[0].sources.map(item => item.shortUUID).sort()).toEqual(["first", "second"]);
    const second = await matching.results("alice", input({ runId, limit: 1, offset: 1 }));
    expect(second.cvImprovements).toEqual(first.cvImprovements);
    const runs = await db.query(`SELECT * FROM candidate_screening_runs ORDER BY id`);
    const reviews = await db.query(`SELECT * FROM candidate_screening_jobs ORDER BY id`);
    const mutations = await db.query(`SELECT * FROM candidate_mutations ORDER BY request_id`);
    const preferencesBefore = await db.query(`SELECT * FROM user_job_preferences ORDER BY user_node_id`);
    for (const bounds of [{ minScore: 90 }, { maxScore: 0 }]) {
      const filtered = await matching.results("alice", input({ runId, sort: "score-asc", ...bounds }));
      expect(filtered.cvImprovements).toEqual(first.cvImprovements);
      expect(filtered.search).toEqual(first.search);
      expect(filtered.run).toEqual(first.run);
      expect(filtered.context).toEqual(first.context);
      expect(filtered.status).toBe(first.status);
      expect(filtered.nextActions).toEqual(first.nextActions);
    }
    expect(await db.query(`SELECT * FROM candidate_screening_runs ORDER BY id`)).toEqual(runs);
    expect(await db.query(`SELECT * FROM candidate_screening_jobs ORDER BY id`)).toEqual(reviews);
    expect(await db.query(`SELECT * FROM candidate_mutations ORDER BY request_id`)).toEqual(mutations);
    expect(await db.query(`SELECT * FROM user_job_preferences ORDER BY user_node_id`)).toEqual(preferencesBefore);
    expect(await db.query(`SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')`)).toEqual([]);
  });

  it("queues the entire relevant catalogue beyond the former 40 and 200 cutoffs without vectors", async () => {
    for (let index = 0; index < 205; index++) await job(`backend-${index}`);
    await job("sales", "SALES");
    const result = await matching.refresh("alice", refreshInput());
    const rows = await db.query<{ short_uuid: string }>(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1`, [result.run!.id]);
    expect(rows).toHaveLength(205);
    expect(rows.every(row => row.short_uuid.startsWith("backend-"))).toBe(true);
    expect(await db.query(`SELECT id FROM candidate_agent_requests`)).toEqual([]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [result.run!.id]))
      .toEqual([{ status: "running" }]);
    expect(await db.query(`SELECT count(*)::int AS queued FROM candidate_agent_requests WHERE status='queued'`))
      .toEqual([{ queued: 1 }]);
  });

  it("prioritizes the strongest career category without discarding other relevant jobs", async () => {
    await job("engineering-manager", "ENGINEERING_MANAGEMENT");
    await job("junior-backend", "BACKEND");
    await db.query(`UPDATE candidate_career_profiles SET directions=ARRAY['ENGINEERING_MANAGEMENT','BACKEND'] WHERE user_node_id=1`);
    await db.query(`UPDATE job_search_documents SET search_vector=to_tsvector('simple','Built TypeScript payment systems') WHERE short_uuid='junior-backend'`);
    const run = await screening.start("alice", documentId, connectionId, refreshInput());
    expect(await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [run.id]))
      .toEqual([{ short_uuid: "engineering-manager" }, { short_uuid: "junior-backend" }]);
  });

  it("uses the current selected CV extraction when no explicit career category exists", async () => {
    await job("backend"); await job("sales", "SALES");
    await db.query(`UPDATE candidate_career_profiles SET directions='{}' WHERE user_node_id=1`);
    await db.query(`UPDATE user_job_preferences SET job_categories='{}' WHERE user_node_id=1`);
    await db.query(`UPDATE candidate_documents SET parsed_result=jsonb_set(parsed_result,'{preferences,jobCategories}','["BACKEND"]') WHERE id=$1`, [documentId]);
    const result = await matching.refresh("alice", refreshInput());
    expect(await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1`, [result.run!.id])).toEqual([{ short_uuid: "backend" }]);
  });

  it("does not let a shared title phrase bypass an unrelated known profession", async () => {
    await job("technical-director", "ENGINEERING_MANAGEMENT");
    await job("director-technical-accounting", "ACCOUNTING");
    await db.query(`UPDATE candidate_career_profiles SET directions='{}' WHERE user_node_id=1`);
    await db.query(`UPDATE user_job_preferences SET job_categories='{}' WHERE user_node_id=1`);
    await db.query(`UPDATE candidate_documents SET parsed_result=jsonb_set(
      jsonb_set(parsed_result,'{preferences,jobCategories}','["ENGINEERING_MANAGEMENT"]'),
      '{roleCategory}','"Technical Director"') WHERE id=$1`, [documentId]);
    const result = await matching.refresh("alice", refreshInput());
    expect(await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1`, [result.run!.id]))
      .toEqual([{ short_uuid: "technical-director" }]);
  });

  it("continues autonomously past ten and forty reviews and completes only after the last relevant job", async () => {
    for (let index = 0; index < 43; index++) await job(`role-${String(index).padStart(2, "0")}`);
    const started = await matching.refresh("alice", refreshInput());
    const runId = started.run!.id;
    for (let completed = 0; completed < 42; completed++) await persistNext(runId);
    expect(await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [runId]))
      .toEqual([{ status: "running" }]);
    expect(await db.query(`SELECT status,count(*)::int AS count FROM candidate_screening_jobs WHERE run_id=$1 GROUP BY status ORDER BY status`, [runId]))
      .toEqual([{ status: "completed", count: 42 }, { status: "running", count: 1 }]);
    await persistNext(runId);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [runId]))
      .toEqual([{ status: "completed" }]);
    expect(await db.query(`SELECT count(*)::int AS count FROM candidate_screening_jobs WHERE run_id=$1 AND assessment IS NOT NULL`, [runId]))
      .toEqual([{ count: 43 }]);
  }, 30_000);

  it("waits for provider capacity, then resumes without a click while respecting a user pause", async () => {
    await job("first"); await job("second");
    const started = await matching.refresh("alice", refreshInput());
    const runId = started.run!.id;
    await db.transaction(manager => screening.enqueue(manager));
    const [initial] = await db.query(`SELECT request_id FROM candidate_screening_jobs WHERE run_id=$1 AND status='running'`, [runId]);
    await db.query(`UPDATE candidate_agent_requests SET status='paused' WHERE id=$1`, [initial.request_id]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [runId])).toEqual([{ status: "paused" }]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT count(*)::int AS count FROM candidate_agent_requests`)).toEqual([{ count: 1 }]);
    await db.query(`UPDATE candidate_screening_runs SET updated_at=now()-interval '31 minutes' WHERE id=$1`, [runId]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [runId])).toEqual([{ status: "running" }]);
    const [resumed] = await db.query(`SELECT request_id,attempt_count FROM candidate_screening_jobs WHERE run_id=$1 AND status='running'`, [runId]);
    expect(resumed.request_id).not.toBe(initial.request_id);
    expect(resumed.attempt_count).toBe(1);
    await screening.control("alice", runId, "pause");
    await db.query(`UPDATE candidate_screening_runs SET updated_at=now()-interval '31 minutes' WHERE id=$1`, [runId]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT status,pause_reason FROM candidate_screening_runs WHERE id=$1`, [runId]))
      .toEqual([{ status: "paused", pause_reason: null }]);
    const newer = await matching.refresh("alice", refreshInput());
    await screening.control("alice", newer.run!.id, "pause");
    await db.query(`UPDATE candidate_screening_runs SET pause_reason='Provider limit reached. Search will check again automatically after 30 minutes.',updated_at=now()-interval '31 minutes' WHERE id=$1`, [runId]);
    await db.transaction(manager => screening.enqueue(manager));
    expect(await db.query(`SELECT status FROM candidate_screening_runs WHERE user_node_id=1 ORDER BY created_at,id`))
      .toEqual([{ status: "paused" }, { status: "paused" }]);
  });

  it("reselects unfinished jobs after an explicit direction change and excludes historical reviews from CV improvements", async () => {
    await job("backend-reviewed"); await job("backend-pending"); await job("sales", "SALES");
    const started = await matching.refresh("alice", refreshInput());
    const runId = started.run!.id;
    await db.query(`UPDATE candidate_screening_jobs SET status='completed',assessment=$2,assessment_at=now(),model='gpt-6-astra'
      WHERE run_id=$1 AND short_uuid='backend-reviewed'`, [runId, JSON.stringify(assessment())]);
    await screening.control("alice", runId, "pause");
    await db.query(`UPDATE candidate_career_profiles SET directions=ARRAY['SALES'],revision=revision+1 WHERE user_node_id=1`);
    await screening.control("alice", runId, "resume");
    expect(await db.query(`SELECT short_uuid,status FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY short_uuid`, [runId])).toEqual([
      { short_uuid: "backend-reviewed", status: "completed" }, { short_uuid: "sales", status: "pending" },
    ]);
    expect((await matching.results("alice", input({ runId }))).cvImprovements.reviewedJobs).toBe(0);
  });

  it("orders candidate-relevant shortlisted jobs using saved CV relevance without adding unrelated categories", async () => {
    await job("a-unranked", "OTHER");
    await job("b-lexical");
    const vector = await job("c-vector");
    await db.query(`UPDATE candidate_documents SET source_text=$2 WHERE id=$1`, [documentId, `${source} / https://example.com/a?b=1`]);
    await bindScreeningSourceFixture(db, documentId);
    await db.query(`UPDATE job_search_documents SET search_vector=to_tsvector('english','TypeScript payment systems') WHERE short_uuid='b-lexical'`);
    await db.query(`INSERT INTO candidate_cv_job_scores(document_id,job_node_id,score) VALUES($1,$2,0.85)`, [documentId, vector.id]);
    const result = await matching.refresh("alice", refreshInput());
    expect(result.run?.total).toBe(2);
    const rows = await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [result.run!.id]);
    expect(rows.map(row => row.short_uuid)).toEqual(["c-vector", "b-lexical"]);
  });

  it("reapplies catalogue and personal exclusions consistently to saved results, vacancy access and new snapshots", async () => {
    const excluded = ["offline", "blocked-job", "applied", "dismissed", "blocked-company", "future",
      "no-employer", "two-employers", "closed-company", "status-edge", "profile-status", "passed"];
    await savedRun([...excluded.map((name): [string, number] => [name, 99]), ["kept", 80]]);
    await db.query(`UPDATE job_search_documents SET online=false WHERE short_uuid='offline'`);
    await db.query(`UPDATE job_search_documents SET blocked=true WHERE short_uuid='blocked-job'`);
    await db.query(`INSERT INTO candidate_applications(id,user_node_id,job_node_id,revision,state) SELECT gen_random_uuid(),1,job_node_id,1,'{"status":"applied"}' FROM job_search_documents WHERE short_uuid='applied'`);
    await db.query(`INSERT INTO user_activity_events(user_node_id,job_node_id,event_type) SELECT 1,job_node_id,'job_dismiss' FROM job_search_documents WHERE short_uuid='dismissed'`);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) SELECT 1,organization_node_id,'BLOCKED_ORG_JOBS' FROM organization_search_documents WHERE organization_id='blocked-company'`);
    await db.query(`UPDATE job_search_documents SET published_timestamp=extract(epoch FROM now()+interval '1 day')*1000 WHERE short_uuid='future'`);
    await db.query(`UPDATE job_search_documents SET organization_id=NULL WHERE short_uuid='no-employer'`);
    await db.query(`UPDATE job_search_documents SET project_id='second-employer' WHERE short_uuid='two-employers'`);
    await db.query(`UPDATE organization_search_documents SET payload=payload||'{"profileStatus":{"name":"closed"}}' WHERE organization_id='closed-company'`);
    const [status] = await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('Status','{"name":"inactive"}') RETURNING id`);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) SELECT organization_node_id,$1,'HAS_STATUS' FROM organization_search_documents WHERE organization_id='status-edge'`, [status.id]);
    const [profile] = await db.query(`INSERT INTO graph_nodes(label) VALUES('Profile') RETURNING id`);
    const [info] = await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('ProfileInfo','{"profileStatus":"inactive"}') RETURNING id`);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_PROFILE_INFO')`, [profile.id, info.id]);
    await db.query(`INSERT INTO graph_relationships(source_id,target_id,type) SELECT $1,organization_node_id,'PROFILE_HAS_ORGANIZATION' FROM organization_search_documents WHERE organization_id='profile-status'`, [profile.id]);
    await db.query(`INSERT INTO candidate_applications(id,user_node_id,job_node_id,revision,state) SELECT gen_random_uuid(),1,job_node_id,1,'{"passed":true}' FROM job_search_documents WHERE short_uuid='passed'`);
    await db.query(`INSERT INTO user_activity_events(user_node_id,job_node_id,event_type,metadata) SELECT 1,job_node_id,'job_apply','{"undone":true}' FROM job_search_documents WHERE short_uuid='kept'`);
    const result = await matching.results("alice", input({ limit: 1 }));
    expect(result.jobs.map(j => j.shortUUID)).toEqual(["kept"]);
    expect(result.total).toBe(1);
    expect(result.cvImprovements.reviewedJobs).toBe(1);
    expect(result.hasMore).toBe(false);
    for (const name of excluded)
      await expect(matching.assertEligible("alice", name, documentId)).rejects.toThrow("Eligible vacancy not found");
    await expect(matching.assertEligible("bob", "kept", documentId)).rejects.toThrow("Eligible vacancy not found");
    const fresh = await matching.refresh("alice", refreshInput());
    const snapshot = await db.query(`SELECT short_uuid,original_ad_text,ad_hash FROM candidate_screening_jobs WHERE run_id=$1`, [fresh.run!.id]);
    expect(snapshot).toEqual([{ short_uuid: "kept", original_ad_text: "Build TypeScript payment systems. Remote worldwide.",
      ad_hash: createHash("md5").update("Build TypeScript payment systems. Remote worldwide.").digest("hex") }]);
  });

  it("rechecks a queued job's live exclusions before creating a provider request", async () => {
    await job("a-applied"); await job("b-dismissed"); await job("c-kept");
    const started = await matching.refresh("alice", refreshInput());
    await db.query(`INSERT INTO user_activity_events(user_node_id,job_node_id,event_type) SELECT 1,job_node_id,'job_apply' FROM job_search_documents WHERE short_uuid='a-applied'`);
    await db.query(`INSERT INTO user_activity_events(user_node_id,job_node_id,event_type) SELECT 1,job_node_id,'job_dismiss' FROM job_search_documents WHERE short_uuid='b-dismissed'`);
    for (let index = 0; index < 3; index++)
      await db.transaction(manager => screening.enqueue(manager));
    const rows = await db.query(`SELECT j.short_uuid,j.status,r.status AS request_status FROM candidate_screening_jobs j
      LEFT JOIN candidate_agent_requests r ON r.id=j.request_id WHERE j.run_id=$1 ORDER BY j.ordinal`, [started.run!.id]);
    expect(rows).toEqual([
      { short_uuid: "a-applied", status: "unavailable", request_status: null },
      { short_uuid: "b-dismissed", status: "unavailable", request_status: null },
      { short_uuid: "c-kept", status: "running", request_status: "queued" },
    ]);
  });

  it("checks current original-ad hashes before global ranking and preserves the original saved evidence", async () => {
    const runId = await savedRun([["changed", 99], ["current", 80]]);
    await db.query(`UPDATE graph_nodes n SET properties=jsonb_set(n.properties,'{content}','"Different requirements."')
      FROM graph_relationships e JOIN job_search_documents j ON j.job_node_id=e.target_id
      WHERE n.id=e.source_id AND n.label='Jobpost' AND e.type='HAS_STRUCTURED_JOBPOST' AND j.short_uuid='changed'`);
    const first = await matching.results("alice", input({ runId, limit: 1 }));
    expect(first.jobs.map(j => j.shortUUID)).toEqual(["current"]);
    expect(first.context.stale).toBe(true);
    expect(first.search.newJobs).toBe(0);
    expect(first.cvImprovements).toMatchObject({ status: "partial", reviewedJobs: 1, excludedStaleJobs: 1 });
    expect(first.jobs[0].context.adOutdated).toBe(false);
    const second = await matching.results("alice", input({ runId, offset: 1, limit: 1 }));
    expect(second.jobs[0]).toMatchObject({ shortUUID: "changed", context: { adOutdated: true } });
    expect((await matching.results("alice", input({ runId, sort: "score-desc", limit: 1 }))).jobs.map(j => j.shortUUID)).toEqual(["changed"]);
    expect((await matching.results("alice", input({ runId, sort: "score-asc", limit: 1 }))).jobs.map(j => j.shortUUID)).toEqual(["current"]);
    const filtered = await matching.results("alice", input({ runId, maxScore: 80 }));
    expect(filtered).toMatchObject({ total: 1, unfilteredTotal: 2, context: { stale: true } });
    expect(filtered.cvImprovements).toEqual(first.cvImprovements);
    expect(second.jobs[0].evidence.find(e => e.dimension === "technical_fit")?.excerpts)
      .toContainEqual({ source: "job_description", excerpt: "Build TypeScript payment systems." });
  });

  it("discloses stale source/profile/ad context without rewriting saved evidence or hiding recovery results", async () => {
    const runId = await savedRun([["saved", 85]]);
    await db.query(`UPDATE candidate_documents SET source_text='Now leading teams.' WHERE id=$1`, [documentId]);
    await db.query(`UPDATE user_job_preferences SET minimum_salary=150000 WHERE user_node_id=1`);
    await db.query(`UPDATE graph_nodes SET properties='{"content":"Now hiring a manager."}' WHERE label='Jobpost'`);
    await db.query(`UPDATE candidate_subscriptions SET status='expired'`);
    await db.query(`UPDATE candidate_ai_connections SET status='disconnected'`);
    const result = await matching.results("alice", input({ runId }));
    expect(result.context.stale).toBe(true);
    expect(result.cvImprovements).toMatchObject({ status: "stale", reviewedJobs: 0, items: [] });
    expect(result.jobs[0].context).toMatchObject({ sourceOutdated: true, profileOutdated: true, adOutdated: true, preferences: { minimumSalary: 120000 } });
    expect(result.jobs[0].constraints.candidate.minimumSalary).toBe(150000);
    expect(result.jobs[0].evidence[1].excerpts[0].excerpt).toBe(source);
    await expect(matching.refresh("alice", refreshInput())).rejects.toThrow("Advanced");
    await expect(matching.results("bob", input({ runId }))).rejects.toThrow("CV not found");
  });

  it("keeps unknown employer constraints unknown instead of inventing salary or legal eligibility", async () => {
    await savedRun([["unknowns", 85]]);
    const result = await matching.results("alice", input());
    expect(result.jobs[0].salary).toEqual({ minimum: null, maximum: null, stated: null, currency: null, basis: null });
    expect(result.jobs[0].unknowns).toContain("Employer sponsorship availability is unstated.");
    expect(result.jobs[0].unknowns).toContain("Employer work-authorization requirements are unstated; eligibility is not confirmed.");
    expect(result.jobs[0].evidence.find(e => e.dimension === "location_fit")?.status).toBe("unclear");
    expect(result.jobs[0].applyUrl).toBe("https://careers.example/unknowns");
  });

  it("reports a missing connection and queues one owned run without fabricating unassessed recommendations", async () => {
    await job("pending");
    await db.query(`UPDATE user_job_preferences SET screening_location_preferences=NULL`);
    await db.query(`UPDATE candidate_ai_connections SET status='disconnected'`);
    expect((await matching.refresh("alice", refreshInput())).status).toBe("connect");
    await db.query(`UPDATE candidate_ai_connections SET status='connected'`);
    const request = refreshInput(), queued = await matching.refresh("alice", request);
    expect(queued.status).toBe("queued");
    expect(queued.jobs).toEqual([]);
    expect((await matching.refresh("alice", request)).run!.id).toBe(queued.run!.id);
    const [count] = await db.query(`SELECT count(*)::int AS value FROM candidate_screening_runs`);
    expect(count.value).toBe(1);
    await db.query(`UPDATE candidate_documents SET source_text='Updated original CV.' WHERE id=$1`, [documentId]);
    const changed = await matching.results("alice", input());
    expect(changed.status).toBe("needs-refresh");
    expect(changed.context.stale).toBe(true);
    await expect(matching.refresh("alice", refreshInput())).rejects.toThrow("source_parse");
    await bindScreeningSourceFixture(db, documentId);
    const fresh = await matching.refresh("alice", refreshInput());
    expect(fresh.run!.id).not.toBe(queued.run!.id);
    const [previous] = await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [queued.run!.id]);
    expect(previous.status).toBe("paused");
  });

  it("requires terminal success before stage advancement and reuses capability independently of the vacancy", async () => {
    await job("first-role");
    await job("second-role");
    const started = await matching.refresh("alice", refreshInput());
    const runId = String(started.run!.id);
    const bindings: Array<{ request: string; stage: string }> = [];
    await persistNext(runId, async (stage, worker, receipt) => {
      bindings.push({ request: stage.request_id, stage: stage.current_stage });
      expect(receipt).toMatchObject({ persisted: true, stage: stage.current_stage, stage_complete: true, job_complete: false });
      expect(await screening.receipt(worker, stage.request_id)).toMatchObject({ persisted: true, stage: stage.current_stage, job_complete: false });
      expect(await db.query("SELECT status FROM candidate_screening_jobs WHERE id=$1", [stage.id])).toEqual([{ status: "running" }]);
      if (stage.current_stage !== "fit") {
        expect(await db.query("SELECT assessment,relationship_id FROM candidate_screening_jobs WHERE id=$1", [stage.id]))
          .toEqual([{ assessment: null, relationship_id: null }]);
      }
      await db.transaction(manager => screening.enqueue(manager));
      expect(await db.query("SELECT request_id,current_stage,status FROM candidate_screening_jobs WHERE id=$1", [stage.id]))
        .toEqual([{ request_id: stage.request_id, current_stage: stage.current_stage, status: "running" }]);
    });
    expect(bindings.map(binding => binding.stage)).toEqual(["evidence", "capability", "fit"]);
    expect(new Set(bindings.map(binding => binding.request)).size).toBe(3);
    await persistNext(runId);
    expect(await db.query(`SELECT count(*)::int AS count FROM candidate_screening_stage_requests WHERE stage='capability'`)).toEqual([{ count: 1 }]);
    const completed = await db.query<{ capability_id: string }>("SELECT capability_id FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal", [runId]);
    expect(completed[0].capability_id).toBeTruthy();
    expect(completed[1].capability_id).toBe(completed[0].capability_id);
    const [old] = bindings;
    await expect(screening.persist(randomUUID(), old.request, assessment())).rejects.toThrow();
  });

  it("pins the selected model and effort across isolated stages and reuses only matching cache attribution", async () => {
    await db.query(`UPDATE candidate_ai_connections SET provider='codex',public_state=public_state||'{"model":"gpt-6-astra","reasoningEffort":"high","modelRevision":1}'::jsonb WHERE id=$1`, [connectionId]);
    await job("terra");
    const first = await matching.refresh("alice", refreshInput());
    const runId = String(first.run!.id);
    expect((await screening.status("alice", documentId, 1, 20, runId)).run)
      .toMatchObject({ model: "gpt-6-astra", reasoningEffort: "high" });
    await db.query(`UPDATE candidate_ai_connections SET public_state=public_state||'{"model":"gpt-6-luna","reasoningEffort":null,"modelRevision":2}'::jsonb WHERE id=$1`, [connectionId]);
    const persisted = await persistNext(runId);
    const status = await screening.status("alice", documentId, 1, 20, runId);
    expect(status.jobs).toEqual([expect.objectContaining({ model: "gpt-6-astra", reasoningEffort: "high", relationshipId: persisted.relationshipId })]);
    const [relation] = await db.query<{ properties: { encryptedMetadata: string } }>(`SELECT properties FROM graph_relationships WHERE id=$1`, [persisted.relationshipId]);
    const [item] = await db.query(`SELECT job_node_id FROM candidate_screening_jobs WHERE run_id=$1`, [runId]);
    expect(openCareerData(relation.properties.encryptedMetadata, "ab".repeat(32), `screening:1:${documentId}:${item.job_node_id}`))
      .toMatchObject({ provider: "codex", model: "gpt-6-astra", reasoningEffort: "high" });
    expect((await matching.results("alice", input({ runId }))).jobs[0].context.model).toBe("gpt-6-astra");
    expect(await db.query(`SELECT b.stage,a.status FROM candidate_screening_stage_requests b JOIN candidate_agent_requests a ON a.id=b.request_id ORDER BY b.created_at`))
      .toEqual(["evidence", "capability", "fit"].map(stage => ({ stage, status: "completed" })));
    await db.query(`UPDATE candidate_ai_connections SET public_state=public_state||'{"model":"gpt-6-astra","reasoningEffort":"high"}'::jsonb WHERE id=$1`, [connectionId]);
    await screening.control("alice", runId, "pause");
    const cached = await matching.refresh("alice", refreshInput());
    expect(cached.run).toMatchObject({ assessed: 1, total: 1 });
    expect((await screening.status("alice", documentId, 1, 20, String(cached.run!.id))).jobs)
      .toEqual([expect.objectContaining({ model: "gpt-6-astra", reasoningEffort: "high", relationshipId: persisted.relationshipId })]);
    const [requests] = await db.query(`SELECT count(*)::int AS count FROM candidate_agent_requests`);
    expect(requests.count).toBe(3);
  });

  it("keeps paused Astra history pinned until explicit fresh Terra assessment without reusing incompatible cached results", async () => {
    await db.query(`UPDATE candidate_ai_connections SET provider='codex',public_state=public_state||'{"model":"gpt-6-astra","reasoningEffort":"low"}'::jsonb WHERE id=$1`, [connectionId]);
    await job("a-saved"); await job("b-pending");
    const old = await screening.start("alice", documentId, connectionId);
    const oldId = String(old.id);
    const saved = await persistNext(oldId);
    await screening.control("alice", oldId, "pause");
    await db.transaction(manager => screening.enqueue(manager));
    expect((await screening.status("alice", documentId, 1, 20, oldId)).run)
      .toMatchObject({ status: "paused", model: "gpt-6-astra", reasoningEffort: "low", assessed: 1, active: 0 });
    const [pausedRequests] = await db.query(`SELECT count(*)::int AS count FROM candidate_agent_requests WHERE status IN ('queued','running')`);
    expect(pausedRequests.count).toBe(0);
    await db.query(`UPDATE candidate_ai_connections SET public_state=public_state||'{"model":"gpt-5.6-terra","reasoningEffort":"low"}'::jsonb WHERE id=$1`, [connectionId]);
    await screening.control("alice", oldId, "resume");
    await db.transaction(manager => screening.enqueue(manager));
    const [resumed] = await db.query(`SELECT request_id,model,reasoning_effort FROM candidate_screening_jobs WHERE run_id=$1 AND status='running'`, [oldId]);
    expect(resumed).toMatchObject({ model: "gpt-6-astra", reasoning_effort: "low" });
    const fresh = await matching.refresh("alice", refreshInput());
    expect(fresh.run!.id).not.toBe(oldId);
    expect(fresh.run).toMatchObject({ assessed: 0, total: 2 });
    expect((await screening.status("alice", documentId, 1, 20, String(fresh.run!.id))).run)
      .toMatchObject({ model: "gpt-5.6-terra", reasoningEffort: "low" });
    const oldStatus = await screening.status("alice", documentId, 1, 20, oldId);
    expect(oldStatus.run).toMatchObject({ status: "paused", model: "gpt-6-astra", assessed: 1 });
    expect(oldStatus.jobs).toEqual([expect.objectContaining({ model: "gpt-6-astra", reasoningEffort: "low", relationshipId: saved.relationshipId })]);
    const [cancelled] = await db.query(`SELECT status FROM candidate_agent_requests WHERE id=$1`, [resumed.request_id]);
    expect(cancelled.status).toBe("cancelled");
    await persistNext(String(fresh.run!.id));
    expect((await screening.status("alice", documentId, 1, 20, String(fresh.run!.id))).jobs)
      .toEqual([expect.objectContaining({ model: "gpt-5.6-terra", reasoningEffort: "low" })]);
  });


  it("preserves the exact goal and uses goal-specific cached assessments without rewriting profile or old results", async () => {
    await job("cache");
    const goal = "  Remote leadership in Paris; at least EUR 140000 annually.\n";
    const first = await matching.refresh("alice", refreshInput({ searchGoal: goal }));
    const firstId = String(first.run!.id);
    const original = await persistNext(firstId);
    await screening.control("alice", firstId, "pause");
    const cached = await matching.refresh("alice", refreshInput({ searchGoal: goal }));
    expect(cached.run!.id).not.toBe(firstId);
    expect(cached.run!.assessed).toBe(1);
    expect(cached.context).toMatchObject({ searchGoal: goal, stale: false, preferences: { location: preferences, minimumSalary: 120000, salaryCurrency: "USD" } });
    expect(cached.jobs[0].context).toMatchObject({ searchGoal: goal, profileOutdated: false });
    const changedGoal = "Onsite TypeScript in Berlin";
    const changed = await matching.refresh("alice", refreshInput({ searchGoal: changedGoal }));
    expect(changed.run).toMatchObject({ assessed: 0, total: 1 });
    expect(changed.jobs).toEqual([]);
    expect(changed.context.searchGoal).toBe(changedGoal);
    const updated = await persistNext(String(changed.run!.id));
    expect(updated.relationshipId).not.toBe(original.relationshipId);
    const old = await matching.results("alice", input({ runId: firstId }));
    expect(old.context.searchGoal).toBe(goal);
    expect(old.jobs[0].context.searchGoal).toBe(goal);
    const [global] = await db.query(`SELECT p.screening_location_preferences,p.minimum_salary,p.salary_currency,c.revision FROM user_job_preferences p JOIN candidate_career_profiles c USING(user_node_id) WHERE p.user_node_id=1`);
    expect(global).toMatchObject({ screening_location_preferences: preferences, minimum_salary: "120000", salary_currency: "USD", revision: 0 });
  });

  it("ignores unsupported proposals for cache reuse and invalidates when the candidate adds experience", async () => {
    await job("a-saved"); await job("b-pending");
    const started = await matching.refresh("alice", refreshInput({ searchGoal: "Technical leadership" }));
    const runId = String(started.run!.id);
    await persistNext(runId);
    const [original] = await db.query<{ candidate_context: string; additional_context: string; relationship_id: string }>(`SELECT r.candidate_context,j.additional_context,j.relationship_id
      FROM candidate_screening_runs r JOIN candidate_screening_jobs j ON j.run_id=r.id
      WHERE r.id=$1 AND j.short_uuid='a-saved'`, [runId]);
    const proposed = await career.evidence("alice", {
      requestId: randomUUID(), revision: 0, statement: "Led a production engineering team.", documentId, excerpt: source,
    });
    const unchanged = await matching.results("alice", input({ runId }));
    expect(unchanged.context).toMatchObject({ stale: false, profileRevision: proposed.revision });
    expect(unchanged.jobs[0].context.profileOutdated).toBe(false);
    await expect(matching.refresh("alice", refreshInput())).rejects.toThrow("Career profile changed");
    expect((await matching.refresh("alice", refreshInput({ revision: proposed.revision }))).run!.id).toBe(runId);
    expect((await screening.status("alice", documentId, 1, 20, runId)).run).toMatchObject({ contextStale: false, status: "running" });
    await persistNext(runId);
    await screening.control("alice", runId, "pause");
    const cached = await matching.refresh("alice", refreshInput({ revision: proposed.revision }));
    expect(cached.run).toMatchObject({ assessed: 2, total: 2 });
    expect(cached.context.stale).toBe(false);
    const [reused] = await db.query(`SELECT relationship_id,additional_context FROM candidate_screening_jobs
      WHERE run_id=$1 AND short_uuid='a-saved'`, [cached.run!.id]);
    expect(reused).toEqual({ relationship_id: original.relationship_id, additional_context: original.additional_context });
    const [historical] = await db.query(`SELECT candidate_context FROM candidate_screening_runs WHERE id=$1`, [runId]);
    expect(historical.candidate_context).toBe(original.candidate_context);
    const enriched = await career.evidence("alice", {
      requestId: randomUUID(), revision: proposed.revision,
      statement: "I led a production engineering team.",
    });
    expect((await matching.results("alice", input({ runId: String(cached.run!.id) }))).context.stale).toBe(true);
    await db.transaction(manager => screening.enqueue(manager));
    const [paused] = await db.query(`SELECT status FROM candidate_screening_runs WHERE id=$1`, [cached.run!.id]);
    expect(paused.status).toBe("paused");
    const refreshed = await matching.refresh("alice", refreshInput({ revision: enriched.revision }));
    expect(refreshed.run).toMatchObject({ assessed: 0, total: 2 });
    expect(refreshed.jobs).toEqual([]);
  });

  it("resumes with the saved goal while applying global changes only to unfinished assessments", async () => {
    await job("a-saved"); await job("b-pending");
    const searchGoal = " Remote leadership ";
    const first = await matching.refresh("alice", refreshInput({ searchGoal }));
    const runId = String(first.run!.id);
    await persistNext(runId);
    await db.transaction(manager => screening.enqueue(manager));
    const [superseded] = await db.query(`SELECT request_id FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid='b-pending'`, [runId]);
    const review = await screening.preferences("alice");
    await screening.savePreferences("alice", { minimumSalary: 160000, workAuthorization: "EU working rights", requiresSponsorship: false },
      { requestId: randomUUID(), revision: review.revision, expectedVersion: review.expectedVersion });
    const [cancelled] = await db.query(`SELECT status FROM candidate_agent_requests WHERE id=$1`, [superseded.request_id]);
    expect(cancelled.status).toBe("cancelled");
    await db.transaction(manager => screening.enqueue(manager));
    expect((await matching.results("alice", input({ runId }))).run!.status).toBe("paused");
    await screening.control("alice", runId, "resume");
    await db.transaction(manager => screening.enqueue(manager));
    const [queued] = await db.query(`SELECT request_id FROM candidate_screening_jobs WHERE run_id=$1 AND short_uuid='b-pending'`, [runId]);
    await screening.control("alice", runId, "resume");
    const [request] = await db.query(`SELECT status FROM candidate_agent_requests WHERE id=$1`, [queued.request_id]);
    expect(request.status).toBe("queued");
    const rows = await db.query(`SELECT short_uuid,additional_context::jsonb->'candidate_preferences' AS context FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY ordinal`, [runId]);
    expect(rows).toEqual([
      { short_uuid: "a-saved", context: expect.objectContaining({ candidate_search_goal: searchGoal, minimum_salary: 120000, work_authorization: null, requires_sponsorship: null }) },
      { short_uuid: "b-pending", context: expect.objectContaining({ candidate_search_goal: searchGoal, minimum_salary: 160000, work_authorization: "EU working rights", requires_sponsorship: false }) },
    ]);
    expect((await screening.status("alice", documentId, 1, 20, runId)).run).toMatchObject({ contextStale: false, status: "running" });
    await persistNext(runId);
    const results = await matching.results("alice", input({ runId }));
    expect(results.run!.assessed).toBe(2);
    expect(results.context.searchGoal).toBe(searchGoal);
  });

  it("retains an omitted goal, accepts an explicit blank, and replays the original mutation after later goal changes", async () => {
    await job("goal");
    const first = await matching.refresh("alice", refreshInput({ searchGoal: " TypeScript " }));
    const omitted = refreshInput();
    expect((await matching.refresh("alice", omitted)).run!.id).toBe(first.run!.id);
    const cleared = await matching.refresh("alice", refreshInput({ searchGoal: "" }));
    expect(cleared.run!.id).not.toBe(first.run!.id);
    expect(cleared.context.searchGoal).toBe("");
    const replay = await matching.refresh("alice", omitted);
    expect(replay.run!.id).toBe(first.run!.id);
    expect(replay.context.searchGoal).toBe(" TypeScript ");
    expect((await matching.results("alice", input())).context.searchGoal).toBe("");
  });

  it.each(["null", "absent"])("persists viable recommendations with %s preferences and leaves location and authorization unknown", async mode => {
    if (mode === "absent") await db.query(`DELETE FROM user_job_preferences WHERE user_node_id=1`);
    else await db.query(`UPDATE user_job_preferences SET screening_location_preferences=NULL,minimum_salary=NULL,salary_currency=NULL`);
    await job("unknown-location");
    const started = await matching.refresh("alice", refreshInput({ searchGoal: "More technical ownership" }));
    expect(started.status).toBe("queued");
    const runId = String(started.run!.id);
    await screening.control("alice", runId, "pause");
    await screening.control("alice", runId, "resume");
    await persistNext(runId);
    const result = await matching.results("alice", input({ runId }));
    expect(result.status).toBe("ready");
    expect(result.context).toMatchObject({ stale: false, searchGoal: "More technical ownership", preferences: { location: null, minimumSalary: null, salaryCurrency: null, workAuthorization: null, requiresSponsorship: null } });
    expect(result.jobs[0]).toMatchObject({ recommendation: "interview", constraints: { hardBlockers: [] } });
    expect(result.jobs[0].evidence.find(e => e.dimension === "location_fit")).toMatchObject({ status: "unclear" });
    const [saved] = await db.query<{ context: Record<string, unknown> }>(`SELECT candidate_context::jsonb AS context FROM candidate_screening_runs WHERE id=$1`, [runId]);
    expect(saved.context.screening_location_preferences).toBeNull();
    expect((await screening.status("alice", documentId, 1, 20, runId)).locationContextOutdated).toBe(0);
  });

  it("still rejects malformed supplied preferences and oversized search goals without queuing work", async () => {
    await job("pending");
    await db.query(`UPDATE user_job_preferences SET screening_location_preferences='{"currentLocation":"Berlin","relocation":"invented_choice"}'`);
    await expect(matching.refresh("alice", refreshInput({ searchGoal: "leadership" }))).rejects.toThrow("relocation preferences");
    await db.query(`UPDATE user_job_preferences SET screening_location_preferences=NULL`);
    await expect(matching.refresh("alice", refreshInput({ searchGoal: "x".repeat(2001) }))).rejects.toThrow("2000");
    const [count] = await db.query(`SELECT count(*)::int AS value FROM candidate_screening_runs`);
    expect(count.value).toBe(0);
    expect((await matching.refresh("alice", refreshInput({ searchGoal: "x".repeat(2000) }))).context.searchGoal).toBe("x".repeat(2000));
  });
  it("retrieves canonical compatible remote and local jobs before scoring without expanding Amsterdam into unconsented SF relocation", async () => {
    await db.query(`DELETE FROM user_job_preferences WHERE user_node_id=1`);
    await db.query(`UPDATE candidate_documents SET source_text='Amsterdam, Netherlands. US and EU citizenship. Built TypeScript payment systems.' WHERE id=$1`, [documentId]);
    await bindScreeningSourceFixture(db, documentId);
    await db.query(`UPDATE candidate_documents SET parsed_result=jsonb_set(parsed_result,'{location}','{"city":"Amsterdam","country":"Netherlands","countryCode":"NL"}') WHERE id=$1`, [documentId]);
    const worldwide = await job("worldwide"), emea = await job("emea"), local = await job("local"),
      onsite = await job("sf-onsite"), hybrid = await job("sf-hybrid"), usRemote = await job("us-residents");
    await db.query(`UPDATE job_search_documents SET payload=payload||'{"location":"San Francisco headquarters"}'::jsonb WHERE job_node_id IN ($1,$2)`, [worldwide.id, emea.id]);
    await db.query(`UPDATE job_work_location_options SET scope='region',regions=ARRAY['EMEA'] WHERE raw_job_node_id=$1`, [emea.adId]);
    await db.query(`UPDATE graph_nodes SET properties='{"content":"Build TypeScript payment systems. Remote in EMEA."}' WHERE id=$1`, [emea.adId]);
    for (const [target, mode, city, country] of [[local, "onsite", "Amsterdam", "NL"], [onsite, "onsite", "San Francisco", "US"], [hybrid, "hybrid", "San Francisco", "US"]] as const) {
      await db.query(`UPDATE job_work_location_options SET mode=$2,scope='city',office_city=$3,office_location=jsonb_build_object('city',$3::text,'countryCode',$4::text) WHERE raw_job_node_id=$1`, [target.adId, mode, city, country]);
      await db.query(`UPDATE job_search_documents SET work_arrangement=jsonb_build_object('version','WorkArrangementV1','classification',$2::text,'fullyRemote',false) WHERE job_node_id=$1`, [target.id, mode]);
      await db.query(`UPDATE graph_nodes SET properties=jsonb_build_object('content',$2::text) WHERE id=$1`, [target.adId, `Build TypeScript payment systems. ${mode} in ${city}.`]);
    }
    await db.query(`UPDATE job_work_location_options SET residency_requirements=ARRAY['United States'] WHERE raw_job_node_id=$1`, [usRemote.adId]);
    const first = await matching.refresh("alice", refreshInput());
    const queued = await db.query(`SELECT short_uuid FROM candidate_screening_jobs WHERE run_id=$1 ORDER BY short_uuid`, [first.run!.id]);
    expect(queued.map(row => row.short_uuid)).toEqual(["emea", "local", "worldwide"]);
    expect(first.context.preferences.sourceLocation).toMatchObject({ currentLocation: "Amsterdam, Netherlands", relocation: null, sourceParseRequired: false });
    const [requestCount] = await db.query(`SELECT count(*)::int AS count FROM candidate_agent_requests`);
    expect(requestCount.count).toBe(0);
    await expect(matching.assertEligible("alice", "sf-onsite", documentId)).rejects.toThrow("Eligible vacancy not found");
    await expect(matching.assertEligible("alice", "sf-hybrid", documentId)).rejects.toThrow("Eligible vacancy not found");
    await expect(matching.assertEligible("alice", "us-residents", documentId)).rejects.toThrow("Eligible vacancy not found");
  });

  it("keeps saved rubric snapshots visible with outdated labels while excluding unresolved relocation and stale CV advice", async () => {
    const runId = await savedRun([["eligible-remote", 85], ["needs-relocation", 95]]);
    await db.query(`UPDATE candidate_screening_jobs SET assessment=jsonb_set(assessment,'{practical_eligibility,status}','"unresolved"') WHERE run_id=$1 AND short_uuid='needs-relocation'`, [runId]);
    const current = await matching.results("alice", input({ runId }));
    expect(current.jobs.map(job => job.shortUUID)).toEqual(["eligible-remote"]);
    expect(current.run).toMatchObject({ assessed: 2, interview: 1, outdatedAssessments: 0 });
    expect(current.context.assessmentOutdated).toBe(false);
    expect((await screening.status("alice", documentId, 1, 20, runId)).jobs).toHaveLength(2);
    await db.query(`UPDATE candidate_screening_runs SET rubric_hash='previous-location-rubric',status='paused' WHERE id=$1`, [runId]);
    const previous = await matching.results("alice", input({ runId }));
    expect(previous).toMatchObject({ total: 1, context: { stale: true, assessmentOutdated: true } });
    expect(previous.jobs.map(job => job.shortUUID)).toEqual(["eligible-remote"]);
    expect(previous.jobs[0].context.rubricOutdated).toBe(true);
    expect(previous.jobs[0].evidence).toEqual(current.jobs[0].evidence);
    expect(previous.cvImprovements).toMatchObject({ status: "stale", reviewedJobs: 0, items: [] });
    expect(previous.run).toMatchObject({ assessed: 2, interview: 1, outdatedAssessments: 2 });
    await expect(screening.control("alice", runId, "resume")).rejects.toThrow("outdated rubric");
    expect(await db.query(`SELECT id FROM candidate_agent_requests WHERE status IN ('queued','running')`)).toEqual([]);
  });
  it("keeps source residence when updating relocation alone and honors an explicit residence clear", async () => {
    await db.query(`DELETE FROM user_job_preferences WHERE user_node_id=1`);
    await db.query(`UPDATE candidate_documents SET source_text='Amsterdam, Netherlands. Built TypeScript payment systems.' WHERE id=$1`, [documentId]);
    await bindScreeningSourceFixture(db, documentId);
    await db.query(`UPDATE candidate_documents SET parsed_result=jsonb_set(parsed_result,'{location}','{"city":"Amsterdam","country":"Netherlands","countryCode":"NL"}') WHERE id=$1`, [documentId]);
    await screening.savePreferences("alice", { relocation: "not_open" });
    const first = JSON.parse(await screening.candidateContext("1", db, undefined, documentId));
    expect(first.candidate_source_location).toMatchObject({ currentLocation: "Amsterdam, Netherlands", relocation: "not_open" });
    expect(first.screening_location_preferences).toEqual({ relocation: "not_open" });
    expect((await screening.preferences("alice")).preferences).toEqual({ currentLocation: null, relocation: "not_open", destinations: null, notes: null });
    await screening.savePreferences("alice", { notes: "Stay near family." });
    expect(JSON.parse(await screening.candidateContext("1", db, undefined, documentId)).candidate_source_location.currentLocation).toBe("Amsterdam, Netherlands");
    await screening.savePreferences("alice", { currentLocation: null });
    const cleared = JSON.parse(await screening.candidateContext("1", db, undefined, documentId));
    expect(cleared.candidate_source_location.currentLocation).toBeNull();
    expect(cleared.screening_location_preferences).toEqual({ relocation: "not_open", notes: "Stay near family.", currentLocation: null });
  });
});
