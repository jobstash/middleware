import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import * as Ajv from "ajv";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CandidateInvocationContext } from "./candidate-context";
import { CareerRepository } from "./career.repository";
import { screeningWeights } from "./job-screening";
import { ScreeningGovernanceService } from "./screening-governance.service";
import { GovernanceInput, ScreeningGovernanceOperation, screeningGovernanceStateSchema } from "./screening-governance.dto";

const url = process.env.CAREER_TEST_DATABASE_URL ?? process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Screening governance authorization and observed trials (isolated PostgreSQL)", () => {
  const schema = `screening_governance_${randomUUID().replace(/-/g, "")}`;
  const alice: CandidateInvocationContext = { kind: "session", owner: "1", wallet: "alice" };
  const bob: CandidateInvocationContext = { kind: "session", owner: "2", wallet: "bob" };
  const employer = { address: "employer", permissions: [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER] } as SessionObject;
  const outsider = { address: "bob", permissions: [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER] } as SessionObject;
  const admin = { address: "admin", permissions: [CheckWalletPermissions.USER, CheckWalletPermissions.ADMIN] } as SessionObject;
  let db: PostgresService, career: CareerRepository, governance: ScreeningGovernanceService, document: string, connection: string;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !["/career_agent_test", "/jobstash_hosted_career_test", "/jobstash_mcp_test"].includes(target.pathname))
      throw new Error("Use a dedicated local career test database");
    db = new PostgresService({ url: url!, applicationName: "screening-governance-tests", maxConnections: 8, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    // Deliberately isolated saved-assessment fixtures, not synthetic output passed off as a real model evaluation.
    await db.query(`
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY,label text NOT NULL,properties jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE graph_relationships(id bigserial PRIMARY KEY,source_id bigint,target_id bigint,type text);
      CREATE TABLE candidate_mutations(user_node_id bigint,request_id uuid,input_hash text,response jsonb,PRIMARY KEY(user_node_id,request_id));
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY,short_uuid text UNIQUE,organization_id text);
      CREATE TABLE candidate_applications(user_node_id bigint,job_node_id bigint,state jsonb);
      CREATE TABLE candidate_screening_runs(id uuid PRIMARY KEY,user_node_id bigint,document_id uuid,cv_hash text,cv_text text,
        candidate_context text,rubric_hash text,provenance_hash text,hidden_context text,policy_snapshot jsonb,evaluation_trial boolean,connection_id uuid,
        created_at timestamptz DEFAULT clock_timestamp());
      CREATE TABLE candidate_screening_jobs(id uuid PRIMARY KEY,run_id uuid REFERENCES candidate_screening_runs(id),job_node_id bigint,short_uuid text,
        ad_hash text,job_text text,additional_context text,hiring_manager_context text,model text,reasoning_effort text,request_id uuid,
        status text,assessment jsonb,assessment_at timestamptz DEFAULT clock_timestamp());
      CREATE TABLE candidate_agent_requests(id uuid PRIMARY KEY,user_node_id bigint,status text,created_at timestamptz DEFAULT clock_timestamp(),finished_at timestamptz DEFAULT clock_timestamp());
      CREATE TABLE candidate_screening_stage_requests(job_id uuid,request_id uuid,stage text,artifact jsonb,saved_at timestamptz DEFAULT clock_timestamp());
    `);
    await db.query(readFileSync("scripts/sql/career-agent-screening-governance.sql", "utf8"));
    career = new CareerRepository(db);
    governance = new ScreeningGovernanceService(db, career);
  });
  afterAll(async () => {
    if (db) { await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.onModuleDestroy(); }
  });
  beforeEach(async () => {
    await db.query(`TRUNCATE graph_nodes,graph_relationships,candidate_mutations,job_search_documents,candidate_applications,candidate_screening_runs,candidate_screening_jobs,candidate_agent_requests,candidate_screening_stage_requests CASCADE`);
    await db.query(`INSERT INTO graph_nodes(id,label,properties) VALUES
      (1,'User','{"wallet":"alice"}'),(2,'User','{"wallet":"bob"}'),(3,'User','{"wallet":"employer"}'),(4,'User','{"wallet":"admin"}'),
      (5,'Organization','{"orgId":"employer-a"}'),(6,'OrgUserSeat','{"seatType":"owner"}'),(7,'Organization','{"orgId":"employer-b"}');
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES(3,6,'OCCUPIES'),(5,6,'HAS_USER_SEAT');`);
    document = randomUUID();
    connection = randomUUID();
  });

  async function action(operation: ScreeningGovernanceOperation, fields: Partial<GovernanceInput> = {}, actor = alice) {
    const state = await governance.read(actor.owner);
    return governance.invoke(actor, operation, { requestId: randomUUID(), revision: state.revision, ...fields });
  }
  async function assessment(job: number, policy: string, score: number, options: { owner?: string; context?: string; fresh?: boolean; observed?: boolean; status?: string; connection?: string; model?: string; effort?: string; revision?: number; shortlist?: number[]; goal?: string; evidence?: string; overall?: number | null } = {}) {
    const id = randomUUID(), run = randomUUID(), request = randomUUID(), owner = options.owner ?? "1";
    const preferences = { career: { revision: options.revision ?? 1, evidence: [options.evidence ?? "same usable evidence"] }, candidate_search_goal: options.goal ?? "same job goal" };
    const candidateContext = JSON.stringify({ ...preferences, shortlist: { version: 1, jobIds: options.shortlist ?? [job] } });
    const additionalContext = JSON.stringify({ candidate_preferences: preferences, company: { description: options.context ?? "same company context" }, job_geography: { country: "SE" } });
    await db.query(`INSERT INTO job_search_documents VALUES($1,$2,'employer-a') ON CONFLICT DO NOTHING`, [job, `job-${job}`]);
    await db.query(`INSERT INTO candidate_screening_runs(id,user_node_id,document_id,cv_hash,cv_text,candidate_context,rubric_hash,provenance_hash,hidden_context,policy_snapshot,evaluation_trial,connection_id)
      VALUES($1,$2,$3,'cv-hash','Original candidate CV',$6,'same code rubric','same provenance','', $4,true,$5)`, [run, owner, document, JSON.stringify({ version: policy }), options.connection ?? connection, candidateContext]);
    const artifact = { technical_fit: score, overall_score: options.overall === undefined ? score : options.overall, recommendation: score >= 50 ? "interview" : "reject" };
    await db.query(`INSERT INTO candidate_screening_jobs(id,run_id,job_node_id,short_uuid,ad_hash,job_text,additional_context,hiring_manager_context,model,reasoning_effort,request_id,status,assessment)
      VALUES($1,$2,$3,$4,'same-ad-hash','Same original job ad',$5,'',$8,$9,$6,'completed',$7)`, [id, run, job, `job-${job}`, additionalContext, request, JSON.stringify(artifact), options.model ?? "selected-model", options.effort ?? "medium"]);
    if (options.observed !== false) {
      await db.query(`INSERT INTO candidate_agent_requests(id,user_node_id,status) VALUES($1,$2,$3)`, [request, owner, options.status ?? "completed"]);
      await db.query(`INSERT INTO candidate_screening_stage_requests(job_id,request_id,stage,artifact) VALUES($1,$2,'fit',$3)`, [id, request, JSON.stringify(artifact)]);
    }
    if (options.fresh === false) await db.query(`UPDATE candidate_screening_runs SET created_at=clock_timestamp()-interval '1 day' WHERE id=$1`, [run]);
    return id;
  }
  async function report(assessmentId: string, outcome: "reject" | "interview", reference: string, verify = true) {
    const id = randomUUID();
    await action("screening_feedback_report", { requestId: id, assessmentId, dimension: "technical_fit", outcome, employerCaseId: reference, evidence: `Candidate report: employer correspondence for ${reference}.` });
    if (verify) await governance.authorityInvoke(employer, "feedback_verify", { requestId: randomUUID(), feedbackId: id, employerCaseId: reference, evidence: "Employer correspondence independently confirms the recorded outcome and responsibility evidence." });
    return id;
  }
  async function proposal() {
    const baseline = (await governance.snapshotPolicy("1")).version;
    const ids: string[] = [];
    for (let job = 10; job < 14; job++) ids.push(await report(await assessment(job, baseline, 90), "reject", `case-${job}`));
    const id = randomUUID();
    await action("screening_policy_propose", { requestId: id, dimension: "technical_fit", feedbackIds: ids, weights: { ...screeningWeights }, guidance: "demonstrated_scope", rationale: "Four verified declines indicate responsibility claims need better evidence review." });
    return { id, baseline, ids };
  }
  async function holdouts(trial: { id: string; baseline: string }, improvement: boolean, count = 4) {
    for (let i = 0; i < count; i++) {
      const interview = i % 2 === 0, job = 30 + i;
      await assessment(job, trial.baseline, interview ? 60 : 40);
      const proposed = await assessment(job, trial.id, improvement ? (interview ? 90 : 10) : (interview ? 60 : 40));
      await report(proposed, interview ? "interview" : "reject", `holdout-${job}`);
    }
  }

  it("reads an uninitialized policy without creating governance, policy, mutation or inference records", async () => {
    const policy = await governance.peekPolicy("1");
    const state = await governance.invoke(alice, "screening_governance_read", {});
    expect(state).toMatchObject({ revision: 0, activePolicy: policy, baseWeights: screeningWeights, feedback: [], proposals: [], eligibility: [], managerContexts: [] });
    expect(policy.weights).toEqual(screeningWeights);
    expect(await db.query(`SELECT
      (SELECT count(*)::int FROM candidate_screening_policy_versions) AS policies,
      (SELECT count(*)::int FROM candidate_screening_governance) AS governance,
      (SELECT count(*)::int FROM candidate_mutations) AS mutations,
      (SELECT count(*)::int FROM candidate_agent_requests) AS requests`))
      .toEqual([{ policies: 0, governance: 0, mutations: 0, requests: 0 }]);
    const pinned = await governance.snapshotPolicy("1");
    expect(pinned).toEqual(policy);
    expect(await governance.peekPolicy("1")).toEqual(pinned);
  });

  it("rejects worker/OAuth human controls, injected scores, invented manager flags and foreign assessments", async () => {
    const oauth = { kind: "oauth", owner: "1", wallet: "alice", grantId: randomUUID(), clientId: randomUUID(), scopes: ["career:write"] } as CandidateInvocationContext;
    const worker = { kind: "worker", owner: "1", wallet: "alice", workerId: randomUUID(), agentRequestId: randomUUID() } as CandidateInvocationContext;
    for (const actor of [oauth, worker]) for (const operation of ["screening_policy_propose", "screening_policy_approve", "screening_feedback_report"] as const)
      await expect(governance.invoke(actor, operation, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(action("screening_policy_validate", { proposalId: randomUUID(), metrics: { baseline: 0.8, proposed: 0.1 } } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(action("screening_feedback_report", { assessmentId: randomUUID(), dimension: "technical_fit", outcome: "reject", employerCaseId: "forged-prediction", evidence: "An employer correspondence report with a forged model verdict.", prediction: "interview" } as never)).rejects.toBeInstanceOf(BadRequestException);
    const foreign = await assessment(15, "foreign", 80, { owner: "2" });
    await expect(report(foreign, "reject", "foreign-report", false)).rejects.toBeInstanceOf(NotFoundException);
    await expect(governance.authorityInvoke(outsider, "manager_context_set", { requestId: randomUUID(), candidateOwner: "1", shortUUID: "job-15", text: "I declare myself the verified hiring manager.", evidence: "Self-declared role is not independent employer authority." })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(governance.authorityInvoke(employer, "feedback_verify", { requestId: randomUUID(), feedbackId: randomUUID(), evidence: "A long enough invented employer message", employerCaseId: "fake", verified: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps reports and tracker dismissals outside the four-case verified threshold", async () => {
    const baseline = (await governance.snapshotPolicy("1")).version, feedbackIds: string[] = [];
    for (let job = 10; job < 14; job++) {
      feedbackIds.push(await report(await assessment(job, baseline, 90), "reject", `reported-${job}`, false));
      await db.query(`INSERT INTO candidate_applications VALUES(1,$1,'{"passed":true,"status":"rejected"}')`, [job]);
    }
    const state = await governance.read("1");
    expect(state.eligibility).toEqual([]);
    expect(state.feedback.map(item => item.status)).toEqual(["reported", "reported", "reported", "reported"]);
    await expect(action("screening_policy_propose", { dimension: "technical_fit", feedbackIds, weights: { ...screeningWeights }, guidance: "demonstrated_scope", rationale: "Reports alone cannot authorize this policy change." })).rejects.toBeInstanceOf(ConflictException);
    for (const feedbackId of feedbackIds) await governance.authorityInvoke(employer, "feedback_verify", { requestId: randomUUID(), feedbackId, employerCaseId: "same-employer-case", evidence: "The exact same independently reviewed employer correspondence." });
    expect((await governance.read("1")).eligibility[0]).toMatchObject({ distinctVacancies: 4, distinctCases: 1, distinctEvidence: 1, eligible: false });
    await expect(action("screening_policy_propose", { dimension: "technical_fit", feedbackIds, weights: { ...screeningWeights }, guidance: "demonstrated_scope", rationale: "Reusing one employer case does not establish four distinct decisions." })).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires actual model/employer disagreement rather than four correctly predicted declines", async () => {
    const baseline = (await governance.snapshotPolicy("1")).version, feedbackIds: string[] = [];
    for (let job = 60; job < 64; job++) feedbackIds.push(await report(await assessment(job, baseline, 20), "reject", `correct-decline-${job}`));
    const agreements = await governance.read("1");
    expect(agreements.eligibility).toEqual([]);
    expect(agreements.feedback.map(row => ({ prediction: row.prediction, outcome: row.outcome, status: row.status })))
      .toEqual(Array.from({ length: 4 }, () => ({ prediction: "reject", outcome: "reject", status: "verified_employer" })));
    await expect(action("screening_policy_propose", { dimension: "technical_fit", feedbackIds, weights: { ...screeningWeights }, guidance: "demonstrated_scope", rationale: "Correctly predicted declines must not trigger rubric changes." })).rejects.toBeInstanceOf(ConflictException);
    const disagreement = await proposal();
    const eligible = await governance.read("1");
    expect(eligible.eligibility[0]).toMatchObject({ distinctVacancies: 4, distinctCases: 4, eligible: true });
    expect(eligible.proposals[0]).toMatchObject({ id: disagreement.id, status: "proposed", feedbackIds: disagreement.ids });
    await action("screening_policy_approve", { proposalId: disagreement.id });
    expect((await governance.snapshotPolicy("1")).version).toBe(disagreement.id);
  });

  it("pins immutable owner policy versions, leaves inference untouched, and enforces revisions/replay integrity", async () => {
    const trial = await proposal();
    const [{ count: before }] = await db.query(`SELECT count(*)::int AS count FROM candidate_agent_requests`);
    const state = await governance.read("1"), requestId = randomUUID();
    const input = { requestId, revision: state.revision, proposalId: trial.id };
    const approved = await governance.invoke(alice, "screening_policy_approve", input);
    expect(approved.activePolicy.version).toBe(trial.id);
    expect(approved.proposals[0].status).toBe("trial");
    expect(await governance.peekPolicy("1")).toEqual(approved.activePolicy);
    expect(await governance.invoke(alice, "screening_policy_approve", input)).toEqual(JSON.parse(JSON.stringify(approved)));
    await expect(governance.invoke(alice, "screening_policy_approve", { ...input, proposalId: randomUUID() })).rejects.toBeInstanceOf(ConflictException);
    await expect(governance.invoke(alice, "screening_policy_validate", { ...input, requestId: randomUUID() })).rejects.toBeInstanceOf(ConflictException);
    await expect(governance.resolvePolicy("2", trial.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(action("screening_policy_approve", { proposalId: trial.id }, bob)).rejects.toBeInstanceOf(NotFoundException);
    expect(await db.query(`SELECT count(*)::int AS count FROM candidate_agent_requests`)).toEqual([{ count: before }]);
    await expect(db.query(`UPDATE candidate_screening_policy_versions SET snapshot='{}' WHERE id=$1`, [trial.id])).rejects.toThrow("immutable");
    await expect(db.query(`DELETE FROM candidate_screening_feedback WHERE id=$1`, [trial.ids[0]])).rejects.toThrow("immutable");
    const valid = new Ajv().compile(screeningGovernanceStateSchema);
    expect(valid(JSON.parse(JSON.stringify(approved)))).toBe(true);
  });

  it("keeps inadequate, cached, stale, failed and mismatched-context observations pending", async () => {
    const trial = await proposal();
    await report(await assessment(49, trial.baseline, 50), "interview", "pre-approval-label");
    await action("screening_policy_approve", { proposalId: trial.id });
    await holdouts(trial, true, 2);
    for (const [index, options] of [{ observed: false }, { fresh: false }, { status: "failed" }, { context: "different manager/ad context" }, { connection: randomUUID() }, { model: "different-model" }, { effort: "low" }].entries()) {
      const job = 40 + index;
      await assessment(job, trial.baseline, 50);
      const proposed = await assessment(job, trial.id, 90, options);
      await report(proposed, "interview", `excluded-${job}`);
    }
    await assessment(49, trial.baseline, 50);
    await report(await assessment(49, trial.id, 90), "interview", "new-label-on-known-case");
    await assessment(50, trial.baseline, 50);
    await report(await assessment(50, trial.id, 90), "interview", "case-10");
    // Fresh repeated assessments on trigger vacancies are not heldouts.
    await assessment(10, trial.baseline, 90);
    const triggerReuse = await assessment(10, trial.id, 10);
    await report(triggerReuse, "reject", "trigger-vacancy-reused");
    const result = await action("screening_policy_validate", { proposalId: trial.id });
    expect(result.activePolicy.version).toBe(trial.id);
    expect(result.proposals[0]).toMatchObject({ status: "trial", validation: { status: "pending", pairCount: 2 } });
  });

  it("pairs unchanged judge inputs across shortlist and revision bookkeeping without ignoring changed goals or evidence", async () => {
    const trial = await proposal();
    await action("screening_policy_approve", { proposalId: trial.id });
    for (let index = 0; index < 4; index++) {
      const job = 70 + index, interview = index % 2 === 0;
      await assessment(job, trial.baseline, interview ? 60 : 40);
      const proposed = await assessment(job, trial.id, interview ? 90 : 10, { revision: 9, shortlist: [job, 999] });
      await report(proposed, interview ? "interview" : "reject", `metadata-only-${job}`);
    }
    for (const [index, options] of [{ goal: "Different actual search goal" }, { evidence: "New usable qualification evidence" }].entries()) {
      const job = 80 + index;
      await assessment(job, trial.baseline, 60);
      await report(await assessment(job, trial.id, 90, options), "interview", `changed-input-${job}`);
    }
    const result = await action("screening_policy_validate", { proposalId: trial.id });
    expect(result.proposals[0]).toMatchObject({ status: "validated", validation: { status: "improved", pairCount: 4 } });
  });

  it("keeps validation pending when either aggregate is unscored despite improved component scores", async () => {
    const trial = await proposal();
    await action("screening_policy_approve", { proposalId: trial.id });
    await holdouts(trial, true, 3);
    await assessment(90, trial.baseline, 40, { overall: null });
    await report(await assessment(90, trial.id, 10), "reject", "unscored-baseline");
    await assessment(91, trial.baseline, 60);
    await report(await assessment(91, trial.id, 90, { overall: null }), "interview", "unscored-proposed");
    const result = await action("screening_policy_validate", { proposalId: trial.id });
    expect(result.activePolicy.version).toBe(trial.id);
    expect(result.proposals[0]).toMatchObject({ status: "trial", validation: { status: "pending", pairCount: 3 } });
  });

  it("accepts shared employer templates on distinct cases, validates improvement and preserves rollback history", async () => {
    const trial = await proposal();
    expect((await governance.read("1")).eligibility[0]).toMatchObject({ distinctVacancies: 4, distinctCases: 4, distinctEvidence: 1, eligible: true });
    await action("screening_policy_approve", { proposalId: trial.id });
    await holdouts(trial, true);
    const validated = await action("screening_policy_validate", { proposalId: trial.id });
    expect(validated.proposals[0]).toMatchObject({ status: "validated", validation: { status: "improved", pairCount: 4 } });
    const validation = validated.proposals[0].validation;
    if (!validation || !("baselineLoss" in validation)) throw new Error("Expected observed paired validation");
    expect(validation.baselineLoss).toBeCloseTo(0.16);
    expect(validated.activePolicy.version).toBe(trial.id);
    const restored = await action("screening_policy_rollback", { proposalId: trial.id, reason: "Human reviewer chooses the previous approved rubric." });
    expect(restored.activePolicy.version).toBe(trial.baseline);
    expect(restored.proposals[0].status).toBe("rolled_back");
    expect((await db.query<{ snapshot: { version: string } }>(`SELECT snapshot FROM candidate_screening_policy_versions WHERE id=$1`, [trial.id]))[0].snapshot.version).toBe(trial.id);
    const audits = await db.query(`SELECT details->>'restoredVersion' AS restored FROM candidate_screening_governance_audit WHERE operation='policy_rollback'`);
    expect(audits).toEqual([{ restored: trial.baseline }]);
  });

  it("atomically rolls back a non-improving trial and prevents its reuse", async () => {
    const trial = await proposal();
    await action("screening_policy_approve", { proposalId: trial.id });
    await holdouts(trial, false);
    const result = await action("screening_policy_validate", { proposalId: trial.id });
    expect(result.activePolicy.version).toBe(trial.baseline);
    expect(result.proposals[0]).toMatchObject({ status: "rolled_back", validation: { status: "not_improved", pairCount: 4 } });
    await expect(governance.resolvePolicy("1", trial.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(action("screening_policy_approve", { proposalId: trial.id })).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires an actual vacancy-bound owner seat or admin and revokes manager precedence without altering history", async () => {
    await assessment(20, "code", 70);
    await db.query(`INSERT INTO job_search_documents VALUES(21,'job-21','employer-b')`);
    expect(await governance.authorityInvoke(outsider, "authority_status", { shortUUID: "job-20" })).toMatchObject({ authority: null, canVerifyEmployerFeedback: false });
    expect(await governance.authorityInvoke(employer, "authority_status", { shortUUID: "job-20" })).toMatchObject({ authority: "organization_owner", canApproveManagerContext: true });
    await expect(governance.authorityInvoke(employer, "manager_context_set", { requestId: randomUUID(), candidateOwner: "1", shortUUID: "job-21", text: "A vacancy-specific responsibility clarification.", evidence: "Actual employer discussion with hiring team." })).rejects.toBeInstanceOf(ForbiddenException);
    const id = randomUUID();
    await governance.authorityInvoke(employer, "manager_context_set", { requestId: id, candidateOwner: "1", shortUUID: "job-20", text: "Hands-on delivery is required in this specific role.", evidence: "Hiring lead confirms this scoped requirement in the role brief." });
    expect(JSON.parse(await governance.trustedHiringManagerContext("1", "20"))).toMatchObject({ contextId: id, vacancy: "job-20", authority: "organization_owner" });
    expect(await governance.trustedHiringManagerContext("2", "20")).toBe("");
    expect(await governance.trustedHiringManagerContext("1", "21")).toBe("");
    await expect(governance.authorityInvoke(outsider, "authority_read", { candidateOwner: "1", shortUUID: "job-20" })).rejects.toBeInstanceOf(ForbiddenException);
    await db.query(`DELETE FROM graph_relationships WHERE type='OCCUPIES' AND source_id=3`);
    expect(await governance.trustedHiringManagerContext("1", "20")).toBe("");
    expect((await governance.read("1")).managerContexts[0]).toMatchObject({ id, active: false, revoked: false });
    await governance.authorityInvoke(admin, "manager_context_revoke", { requestId: randomUUID(), contextId: id });
    expect((await governance.read("1")).managerContexts[0]).toMatchObject({ id, active: false, revoked: true });
    expect((await db.query(`SELECT context_text FROM candidate_screening_manager_contexts WHERE id=$1`, [id]))[0].context_text).toContain("Hands-on delivery");
  });
});
