import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import * as Ajv from "ajv";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { SessionObject } from "src/shared/interfaces";
import { CheckWalletPermissions } from "src/shared/constants";
import { CareerRepository } from "./career.repository";
import { CandidateInvocationContext } from "./candidate-context";
import { screeningMetrics, screeningRubricHash, screeningWeights } from "./job-screening";
import { ScreeningPolicy } from "./screening-workflow";
import { pairedPolicyCalibration } from "./screening-calibration";
import { screeningContextSql, screeningAssessmentContextSql } from "./screening-context";
import { AuthorityInput, GovernanceInput, governanceGuidance, ScreeningAuthorityOperation, ScreeningGovernanceOperation, ScreeningGovernanceState, screeningAuthoritySchemas, screeningGovernanceSchemas } from "./screening-governance.dto";

type Executor = { query(sql: string, parameters?: unknown[]): Promise<Row[]> };
type Row = Record<string, any>;
const ajv = new Ajv({ allErrors: true });
const governanceValidators = Object.fromEntries(Object.entries(screeningGovernanceSchemas).map(([key, schema]) => [key, ajv.compile(schema)]));
const authorityValidators = Object.fromEntries(Object.entries(screeningAuthoritySchemas).map(([key, schema]) => [key, ajv.compile(schema)]));

@Injectable()
export class ScreeningGovernanceService {
  constructor(private readonly postgres: PostgresService, private readonly career: CareerRepository) {}

  private async initialize(owner: string, db: Executor) {
    const version = `code:${screeningRubricHash}:${owner}`;
    await db.query(`INSERT INTO candidate_screening_policy_versions(id,user_node_id,snapshot) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [version, owner, JSON.stringify({ version, weights: screeningWeights })]);
    await db.query(`INSERT INTO candidate_screening_governance(user_node_id,active_version) VALUES($1,$2) ON CONFLICT DO NOTHING`, [owner, version]);
  }

  async snapshotPolicy(owner: string, _functionKey?: string, db: Executor = this.postgres): Promise<ScreeningPolicy> {
    await this.initialize(owner, db);
    return this.peekPolicy(owner, db);
  }

  async peekPolicy(owner: string, db: Executor = this.postgres): Promise<ScreeningPolicy> {
    const [row] = await db.query(`SELECT p.snapshot FROM candidate_screening_governance g JOIN candidate_screening_policy_versions p ON p.id=g.active_version AND p.user_node_id=g.user_node_id WHERE g.user_node_id=$1`, [owner]);
    return row?.snapshot ?? { version: `code:${screeningRubricHash}:${owner}`, weights: screeningWeights };
  }

  async resolvePolicy(owner: string, version: string, db: Executor = this.postgres): Promise<ScreeningPolicy> {
    await this.initialize(owner, db);
    const [row] = await db.query(`SELECT p.snapshot FROM candidate_screening_policy_versions p WHERE p.user_node_id=$1 AND p.id=$2 AND (
      EXISTS(SELECT 1 FROM candidate_screening_governance g WHERE g.user_node_id=$1 AND g.active_version=p.id) OR
      EXISTS(SELECT 1 FROM candidate_screening_policy_proposals q JOIN candidate_screening_policy_decisions d ON d.proposal_id=q.id
        WHERE q.user_node_id=$1 AND d.status='trial' AND (q.previous_version=p.id OR q.snapshot->>'version'=p.id)))`, [owner, version]);
    if (!row) throw new ForbiddenException("Only your active policy or an approved trial's paired baseline may be selected");
    return row.snapshot;
  }

  private async organizationOwner(actor: string, organization: string | null, db: Executor): Promise<boolean> {
    if (!organization) return false;
    const [row] = await db.query(`SELECT EXISTS(SELECT 1 FROM graph_nodes u
      JOIN graph_relationships occupancy ON occupancy.source_id=u.id AND occupancy.type='OCCUPIES'
      JOIN graph_nodes seat ON seat.id=occupancy.target_id
      JOIN graph_relationships binding ON binding.target_id=seat.id AND binding.type='HAS_USER_SEAT'
      JOIN graph_nodes org ON org.id=binding.source_id AND org.label='Organization'
      WHERE u.id=$1 AND u.label='User' AND org.properties->>'orgId'=$2 AND seat.properties->>'seatType'='owner') AS allowed`, [actor, organization]);
    return row.allowed;
  }

  async trustedHiringManagerContexts(owner: string, jobIds: string[], db: Executor = this.postgres): Promise<Record<string, string>> {
    if (!jobIds.length) return {};
    const rows: Row[] = await db.query(`SELECT requested.job_key,m.* FROM unnest($2::text[]) requested(job_key)
      JOIN job_search_documents j ON j.job_node_id::text=requested.job_key OR j.short_uuid=requested.job_key
      JOIN LATERAL(SELECT * FROM candidate_screening_manager_contexts context WHERE context.user_node_id=$1 AND context.short_uuid=j.short_uuid
        ORDER BY context.created_at DESC,context.id DESC LIMIT 1) m ON true
      LEFT JOIN candidate_screening_manager_revocations revoked ON revoked.context_id=m.id
      WHERE revoked.context_id IS NULL AND m.organization_id IS NOT DISTINCT FROM j.organization_id
        AND (m.authority='platform_admin' OR EXISTS(SELECT 1 FROM graph_relationships occupancy
          JOIN graph_nodes seat ON seat.id=occupancy.target_id AND seat.properties->>'seatType'='owner'
          JOIN graph_relationships binding ON binding.target_id=seat.id AND binding.type='HAS_USER_SEAT'
          JOIN graph_nodes org ON org.id=binding.source_id AND org.label='Organization' AND org.properties->>'orgId'=m.organization_id
          WHERE occupancy.source_id=m.actor_node_id AND occupancy.type='OCCUPIES'))`, [owner, jobIds]);
    return Object.fromEntries(rows.map(row => [row.job_key, JSON.stringify({ authority: row.authority, contextId: row.id, vacancy: row.short_uuid, text: row.context_text })]));
  }

  async trustedHiringManagerContext(owner: string, jobId: string, db: Executor = this.postgres): Promise<string> {
    return (await this.trustedHiringManagerContexts(owner, [jobId], db))[jobId] ?? "";
  }

  async invoke(context: CandidateInvocationContext, operation: ScreeningGovernanceOperation, input: unknown) {
    if (context.kind !== "session") throw new ForbiddenException("Screening feedback and policy controls require a signed-in human session");
    if (!Object.hasOwn(governanceValidators, operation) || !governanceValidators[operation](input)) throw new BadRequestException("Invalid screening governance input");
    await this.career.authorizeCandidate(context);
    if (operation === "screening_governance_read") return this.read(context.owner);
    const value = input as GovernanceInput;
    return this.career.mutate(context.wallet, operation, value, async (db, owner) => {
      await this.initialize(owner, db);
      const [state] = await db.query(`SELECT * FROM candidate_screening_governance WHERE user_node_id=$1 FOR UPDATE`, [owner]);
      if (state.revision !== value.revision) throw new ConflictException("Screening governance changed; reload before saving");
      if (operation === "screening_feedback_report") await this.report(db, owner, value);
      else if (operation === "screening_policy_propose") await this.propose(db, owner, state.active_version, value);
      else await this.decide(db, owner, state.active_version, operation, value);
      await db.query(`UPDATE candidate_screening_governance SET revision=revision+1 WHERE user_node_id=$1`, [owner]);
      await this.audit(db, owner, owner, operation, { requestId: value.requestId, proposalId: value.proposalId ?? null });
      return this.read(owner, db);
    });
  }

  private async report(db: EntityManager, owner: string, input: GovernanceInput) {
    const [assessment] = await db.query(`SELECT j.short_uuid,d.organization_id FROM candidate_screening_jobs j
      JOIN candidate_screening_runs r ON r.id=j.run_id LEFT JOIN job_search_documents d ON d.job_node_id=j.job_node_id
      WHERE j.id=$1 AND r.user_node_id=$2 AND j.status='completed' AND j.assessment IS NOT NULL`, [input.assessmentId, owner]);
    if (!assessment) throw new NotFoundException("Completed owned assessment not found");
    const [previous] = await db.query(`SELECT id FROM candidate_screening_feedback WHERE user_node_id=$1 AND assessment_id=$2 AND dimension=$3`, [owner, input.assessmentId, input.dimension]);
    if (previous) throw new ConflictException("This assessment already has a report for that dimension");
    await db.query(`INSERT INTO candidate_screening_feedback(id,user_node_id,assessment_id,short_uuid,organization_id,dimension,outcome,evidence,employer_case_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [input.requestId, owner, input.assessmentId, assessment.short_uuid, assessment.organization_id, input.dimension, input.outcome, input.evidence!.trim(), input.employerCaseId!.trim()]);
  }

  private async triggerCases(db: Executor, owner: string, dimension: string, ids: string[]) {
    const rows: Row[] = await db.query(`SELECT f.id,f.short_uuid,v.organization_id,v.employer_case_id FROM candidate_screening_feedback f
      JOIN candidate_screening_feedback_verifications v ON v.feedback_id=f.id
      JOIN candidate_screening_jobs j ON j.id=f.assessment_id AND j.status='completed' AND j.assessment->>'recommendation'='interview'
      JOIN candidate_screening_runs r ON r.id=j.run_id AND r.user_node_id=f.user_node_id
      WHERE f.user_node_id=$1 AND f.dimension=$2 AND f.outcome='reject' AND f.id=ANY($3::uuid[])`, [owner, dimension, ids]);
    const jobs = new Set(rows.map(row => row.short_uuid));
    const cases = new Set(rows.map(row => `${row.organization_id ?? "platform"}:${row.employer_case_id.toLowerCase().trim()}`));
    if (rows.length !== ids.length || jobs.size < 4 || cases.size < 4)
      throw new ConflictException("A proposal needs four distinct evidenced, employer-verified declines where the saved model prediction was interview, for the same dimension");
    return rows;
  }

  private async propose(db: EntityManager, owner: string, active: string, input: GovernanceInput) {
    const [trial] = await db.query(`SELECT p.id FROM candidate_screening_policy_proposals p JOIN candidate_screening_policy_decisions d ON d.proposal_id=p.id WHERE p.user_node_id=$1 AND d.status='trial'`, [owner]);
    if (trial) throw new ConflictException("Validate or roll back the current trial before proposing another policy");
    await this.triggerCases(db, owner, input.dimension!, input.feedbackIds!);
    const total = screeningMetrics.reduce((sum, key) => sum + input.weights![key], 0);
    if (total !== Object.values(screeningWeights).reduce((a, b) => a + b, 0) || screeningMetrics.some(key => Math.abs(input.weights![key] - screeningWeights[key]) > 5))
      throw new BadRequestException("Keep the rubric's total weight and change each dimension by at most five points from the code rubric");
    const snapshot: ScreeningPolicy = { version: input.requestId, weights: input.weights!, guidance: `Dimension: ${input.dimension}. ${governanceGuidance[input.guidance!]}` };
    await db.query(`INSERT INTO candidate_screening_policy_proposals(id,user_node_id,dimension,feedback_ids,snapshot,previous_version,rationale) VALUES($1,$2,$3,$4,$5,$6,$7)`, [input.requestId, owner, input.dimension, input.feedbackIds, JSON.stringify(snapshot), active, input.rationale]);
    await db.query(`INSERT INTO candidate_screening_policy_decisions(proposal_id,status) VALUES($1,'proposed')`, [input.requestId]);
  }

  private async decide(db: EntityManager, owner: string, active: string, operation: ScreeningGovernanceOperation, input: GovernanceInput) {
    const [proposal] = await db.query(`SELECT p.*,d.status,d.approved_at FROM candidate_screening_policy_proposals p JOIN candidate_screening_policy_decisions d ON d.proposal_id=p.id WHERE p.id=$1 AND p.user_node_id=$2 FOR UPDATE OF d`, [input.proposalId, owner]);
    if (!proposal) throw new NotFoundException("Owned policy proposal not found");
    if (operation === "screening_policy_approve") {
      if (proposal.status !== "proposed" || active !== proposal.previous_version) throw new ConflictException("Proposal is no longer based on the active policy");
      const [trial] = await db.query(`SELECT p.id FROM candidate_screening_policy_proposals p JOIN candidate_screening_policy_decisions d ON d.proposal_id=p.id WHERE p.user_node_id=$1 AND d.status='trial'`, [owner]);
      if (trial) throw new ConflictException("An approved trial is already pending validation");
      await this.triggerCases(db, owner, proposal.dimension, proposal.feedback_ids);
      await db.query(`INSERT INTO candidate_screening_policy_versions(id,user_node_id,previous_version,snapshot) VALUES($1,$2,$3,$4)`, [proposal.id, owner, active, JSON.stringify(proposal.snapshot)]);
      await db.query(`UPDATE candidate_screening_policy_decisions SET status='trial',approved_at=clock_timestamp() WHERE proposal_id=$1`, [proposal.id]);
      await db.query(`UPDATE candidate_screening_governance SET active_version=$2 WHERE user_node_id=$1 AND active_version=$3`, [owner, proposal.id, active]);
      return;
    }
    if (!["trial", "validated"].includes(proposal.status) || active !== proposal.id) throw new ConflictException("Only the current trial or validated policy can be changed");
    if (operation === "screening_policy_rollback") {
      await this.rollback(db, owner, proposal, { reason: input.reason });
      return;
    }
    if (proposal.status !== "trial") throw new ConflictException("This policy trial has already been validated");
    const pairs = await this.observedPairs(db, owner, proposal);
    const validation = pairedPolicyCalibration(pairs.map(pair => ({ baseline: Number(pair.baseline), proposed: Number(pair.proposed), outcome: pair.outcome })));
    const observed = { ...validation, assessmentPairs: pairs.map(pair => ({ baselineId: pair.baseline_id, proposedId: pair.proposed_id, feedbackId: pair.feedback_id })) };
    await this.audit(db, owner, owner, "policy_validation_observed", { proposalId: proposal.id, ...observed });
    if (validation.status === "not_improved") await this.rollback(db, owner, proposal, observed);
    else await db.query(`UPDATE candidate_screening_policy_decisions SET status=$2,validation=$3 WHERE proposal_id=$1`, [proposal.id, validation.status === "improved" ? "validated" : "trial", JSON.stringify(observed)]);
  }

  private async observedPairs(db: Executor, owner: string, proposal: Row): Promise<Row[]> {
    // Labels and numeric scores are observed database records, never client-submitted calibration summaries.
    // DISTINCT ON prevents repeated attempts or duplicated labels from multiplying a holdout vacancy.
    const rows: Row[] = await db.query(`SELECT DISTINCT ON (p.short_uuid) b.id AS baseline_id,p.id AS proposed_id,f.id AS feedback_id,f.outcome,
      b.assessment->>$5 AS baseline,p.assessment->>$5 AS proposed,v.organization_id,v.employer_case_id
      FROM candidate_screening_jobs p JOIN candidate_screening_runs pr ON pr.id=p.run_id
      JOIN candidate_screening_jobs b ON b.short_uuid=p.short_uuid AND b.ad_hash=p.ad_hash AND b.job_text=p.job_text
        AND ${screeningAssessmentContextSql("b.additional_context")}=${screeningAssessmentContextSql("p.additional_context")}
        AND b.hiring_manager_context IS NOT DISTINCT FROM p.hiring_manager_context
        AND b.model IS NOT DISTINCT FROM p.model AND b.reasoning_effort IS NOT DISTINCT FROM p.reasoning_effort
      JOIN candidate_screening_runs br ON br.id=b.run_id AND br.user_node_id=pr.user_node_id AND br.document_id=pr.document_id
        AND br.connection_id=pr.connection_id
        AND br.cv_hash=pr.cv_hash AND br.cv_text=pr.cv_text AND ${screeningContextSql("br.candidate_context")}=${screeningContextSql("pr.candidate_context")} AND br.rubric_hash=pr.rubric_hash
        AND br.provenance_hash IS NOT DISTINCT FROM pr.provenance_hash AND br.hidden_context IS NOT DISTINCT FROM pr.hidden_context
      JOIN candidate_screening_stage_requests ps ON ps.job_id=p.id AND ps.request_id=p.request_id AND ps.stage='fit' AND ps.artifact=p.assessment
      JOIN candidate_screening_stage_requests bs ON bs.job_id=b.id AND bs.request_id=b.request_id AND bs.stage='fit' AND bs.artifact=b.assessment
      JOIN candidate_agent_requests pa ON pa.id=ps.request_id AND pa.user_node_id=$1 AND pa.status='completed'
      JOIN candidate_agent_requests ba ON ba.id=bs.request_id AND ba.user_node_id=$1 AND ba.status='completed'
      JOIN candidate_screening_feedback f ON f.user_node_id=pr.user_node_id AND f.dimension=$5 AND f.short_uuid=p.short_uuid AND f.assessment_id IN (p.id,b.id)
      JOIN candidate_screening_feedback_verifications v ON v.feedback_id=f.id
      WHERE pr.user_node_id=$1 AND pr.policy_snapshot->>'version'=$2 AND br.policy_snapshot->>'version'=$3
        AND pr.created_at>$4 AND br.created_at>$4 AND p.assessment_at>$4 AND b.assessment_at>$4
        AND pr.evaluation_trial AND br.evaluation_trial AND ps.saved_at>$4 AND bs.saved_at>$4
        AND pa.created_at>$4 AND ba.created_at>$4 AND pa.finished_at>$4 AND ba.finished_at>$4
        AND p.status='completed' AND b.status='completed'
        AND p.model IS NOT NULL
        AND f.created_at>$4 AND v.verified_at>$4
        AND jsonb_typeof(p.assessment->$5)='number' AND jsonb_typeof(b.assessment->$5)='number'
        AND jsonb_typeof(p.assessment->'overall_score')='number' AND jsonb_typeof(b.assessment->'overall_score')='number'
        AND NOT EXISTS(SELECT 1 FROM candidate_screening_feedback prior WHERE prior.user_node_id=$1 AND prior.short_uuid=p.short_uuid AND prior.created_at<=$4)
        AND NOT EXISTS(SELECT 1 FROM candidate_screening_feedback trigger
          JOIN candidate_screening_feedback_verifications tv ON tv.feedback_id=trigger.id
          WHERE trigger.id=ANY($6::uuid[]) AND (trigger.short_uuid=p.short_uuid OR
            (tv.organization_id IS NOT DISTINCT FROM v.organization_id AND lower(trim(tv.employer_case_id))=lower(trim(v.employer_case_id)))))
        AND NOT EXISTS(SELECT 1 FROM candidate_screening_feedback other JOIN candidate_screening_feedback_verifications ov ON ov.feedback_id=other.id
          WHERE other.user_node_id=$1 AND other.short_uuid=p.short_uuid AND other.dimension=$5 AND other.outcome<>f.outcome)
      ORDER BY p.short_uuid,p.assessment_at,b.assessment_at,f.created_at`, [owner, proposal.id, proposal.previous_version, proposal.approved_at, proposal.dimension, proposal.feedback_ids]);
    const cases = new Set<string>();
    return rows.filter(row => {
      const caseId = `${row.organization_id ?? "platform"}:${row.employer_case_id.toLowerCase().trim()}`;
      if (cases.has(caseId)) return false;
      cases.add(caseId);
      return true;
    });
  }

  private async rollback(db: EntityManager, owner: string, proposal: Row, validation: unknown) {
    await db.query(`UPDATE candidate_screening_governance SET active_version=$2 WHERE user_node_id=$1 AND active_version=$3`, [owner, proposal.previous_version, proposal.id]);
    await db.query(`UPDATE candidate_screening_policy_decisions SET status='rolled_back',validation=$2 WHERE proposal_id=$1`, [proposal.id, JSON.stringify(validation)]);
    await this.audit(db, owner, owner, "policy_rollback", { proposalId: proposal.id, restoredVersion: proposal.previous_version, validation });
  }

  private audit(db: Executor, owner: string, actor: string, operation: string, details: unknown) {
    return db.query(`INSERT INTO candidate_screening_governance_audit(id,user_node_id,actor_node_id,operation,details) VALUES($1,$2,$3,$4,$5)`, [randomUUID(), owner, actor, operation, JSON.stringify(details)]);
  }

  async read(owner: string, db: Executor = this.postgres): Promise<ScreeningGovernanceState> {
    if (db === this.postgres) return this.postgres.transaction(manager => this.read(owner, manager));
    const [state] = await db.query(`SELECT revision FROM candidate_screening_governance WHERE user_node_id=$1 FOR SHARE`, [owner]);
    const activePolicy = await this.peekPolicy(owner, db);
    const feedback = await db.query(`SELECT f.id,f.assessment_id AS "assessmentId",f.short_uuid AS "shortUUID",f.dimension,f.outcome,f.evidence,
      j.assessment->>'recommendation' AS prediction,f.employer_case_id AS "employerCaseId",f.created_at AS "createdAt",CASE WHEN v.feedback_id IS NULL THEN 'reported' ELSE 'verified_employer' END AS status,
      v.authority,v.verified_at AS "verifiedAt" FROM candidate_screening_feedback f
      JOIN candidate_screening_jobs j ON j.id=f.assessment_id JOIN candidate_screening_runs r ON r.id=j.run_id AND r.user_node_id=f.user_node_id
      LEFT JOIN candidate_screening_feedback_verifications v ON v.feedback_id=f.id WHERE f.user_node_id=$1 ORDER BY f.created_at DESC LIMIT 200`, [owner]) as ScreeningGovernanceState["feedback"];
    const proposals = await db.query(`SELECT p.id,p.dimension,p.feedback_ids AS "feedbackIds",p.snapshot,p.previous_version AS "previousVersion",p.rationale,p.created_at AS "createdAt",d.status,d.approved_at AS "approvedAt",d.validation FROM candidate_screening_policy_proposals p JOIN candidate_screening_policy_decisions d ON d.proposal_id=p.id WHERE p.user_node_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [owner]) as ScreeningGovernanceState["proposals"];
    const eligibility = await db.query(`SELECT f.dimension,count(DISTINCT f.short_uuid)::int AS "distinctVacancies",count(DISTINCT (COALESCE(v.organization_id,'platform'),lower(trim(v.employer_case_id))))::int AS "distinctCases",count(DISTINCT v.evidence_hash)::int AS "distinctEvidence"
      FROM candidate_screening_feedback f JOIN candidate_screening_feedback_verifications v ON v.feedback_id=f.id
      JOIN candidate_screening_jobs j ON j.id=f.assessment_id AND j.status='completed' AND j.assessment->>'recommendation'='interview'
      JOIN candidate_screening_runs r ON r.id=j.run_id AND r.user_node_id=f.user_node_id
      WHERE f.user_node_id=$1 AND f.outcome='reject' GROUP BY f.dimension`, [owner]) as Array<Omit<ScreeningGovernanceState["eligibility"][number], "eligible">>;
    const contexts = await db.query(`SELECT m.id,m.short_uuid AS "shortUUID",m.context_text AS text,m.authority,m.created_at AS "createdAt",r.context_id IS NOT NULL AS revoked FROM candidate_screening_manager_contexts m LEFT JOIN candidate_screening_manager_revocations r ON r.context_id=m.id WHERE m.user_node_id=$1 ORDER BY m.created_at DESC LIMIT 100`, [owner]) as Array<Omit<ScreeningGovernanceState["managerContexts"][number], "active">>;
    const activeContexts: Record<string, string> = {};
    const trustedContexts = await this.trustedHiringManagerContexts(owner, [...new Set(contexts.map(row => row.shortUUID))], db);
    for (const [shortUUID, trusted] of Object.entries(trustedContexts)) activeContexts[shortUUID] = JSON.parse(trusted).contextId;
    const managerContexts = contexts.map(row => ({ ...row, active: activeContexts[row.shortUUID] === row.id }));
    return { candidateOwner: owner, revision: state?.revision ?? 0, activePolicy, baseWeights: screeningWeights, feedback, proposals, eligibility: eligibility.map(row => ({ ...row, eligible: Math.min(row.distinctVacancies, row.distinctCases) >= 4 })), managerContexts,
      authority: { canVerifyEmployerFeedback: false, canApproveManagerContext: false, verificationRoute: "/profile/screening-authority/invoke" } };
  }

  async authorityInvoke(session: SessionObject, operation: ScreeningAuthorityOperation, input: unknown) {
    if (!session?.address || !Object.hasOwn(authorityValidators, operation) || !authorityValidators[operation](input)) throw new BadRequestException("Invalid employer authority input");
    const value = input as AuthorityInput;
    return this.postgres.transaction(async db => {
      const actor = await this.career.owner(session.address, db, true);
      let target: Row;
      if (operation === "authority_status") {
        const [job] = await db.query(`SELECT organization_id FROM job_search_documents WHERE short_uuid=$1`, [value.shortUUID]);
        if (!job) throw new NotFoundException("Vacancy not found");
        const admin = session.permissions?.includes(CheckWalletPermissions.SUPER_ADMIN) || session.permissions?.includes(CheckWalletPermissions.ADMIN);
        const authority = admin ? "platform_admin" : await this.organizationOwner(actor, job.organization_id, db) ? "organization_owner" : null;
        return { shortUUID: value.shortUUID, authority, canVerifyEmployerFeedback: !!authority, canApproveManagerContext: !!authority };
      }
      if (operation === "feedback_verify") {
        [target] = await db.query(`SELECT user_node_id,organization_id,short_uuid FROM candidate_screening_feedback WHERE id=$1`, [value.feedbackId]);
      } else if (operation === "manager_context_revoke") {
        [target] = await db.query(`SELECT user_node_id,organization_id,short_uuid FROM candidate_screening_manager_contexts WHERE id=$1`, [value.contextId]);
      } else {
        [target] = await db.query(`SELECT $1::bigint AS user_node_id,d.organization_id,d.short_uuid FROM job_search_documents d
          WHERE d.short_uuid=$2 AND EXISTS(SELECT 1 FROM graph_nodes u WHERE u.id=$1 AND u.label='User')`, [value.candidateOwner, value.shortUUID]);
      }
      if (!target) throw new NotFoundException("Feedback or vacancy not found");
      const admin = session.permissions?.includes(CheckWalletPermissions.SUPER_ADMIN) || session.permissions?.includes(CheckWalletPermissions.ADMIN);
      const authority = admin ? "platform_admin" : await this.organizationOwner(actor, target.organization_id, db) ? "organization_owner" : null;
      if (!authority) throw new ForbiddenException("A current owner seat for this vacancy's employer or platform administrator is required");
      if (operation === "authority_read") {
        const feedback = await db.query(`SELECT f.id,f.user_node_id::text AS "candidateOwner",f.assessment_id AS "assessmentId",f.dimension,f.outcome,
          f.evidence,j.assessment->>'recommendation' AS prediction,f.employer_case_id AS "employerCaseId",CASE WHEN v.feedback_id IS NULL THEN 'reported' ELSE 'verified_employer' END AS status
          FROM candidate_screening_feedback f JOIN candidate_screening_jobs j ON j.id=f.assessment_id
          JOIN candidate_screening_runs r ON r.id=j.run_id AND r.user_node_id=f.user_node_id
          LEFT JOIN candidate_screening_feedback_verifications v ON v.feedback_id=f.id
          WHERE f.user_node_id=$1 AND f.short_uuid=$2 ORDER BY f.created_at DESC LIMIT 200`, [target.user_node_id, target.short_uuid]);
        const contexts = await db.query(`SELECT m.id,m.context_text AS text,m.authority,r.context_id IS NOT NULL AS revoked FROM candidate_screening_manager_contexts m
          LEFT JOIN candidate_screening_manager_revocations r ON r.context_id=m.id WHERE m.user_node_id=$1 AND m.short_uuid=$2 ORDER BY m.created_at DESC LIMIT 100`, [target.user_node_id, target.short_uuid]);
        return { candidateOwner: String(target.user_node_id), shortUUID: target.short_uuid, authority, feedback, managerContexts: contexts };
      }
      const fingerprint = createHash("sha256").update(JSON.stringify({ operation, input, authority })).digest("hex");
      const [receipt] = await db.query(`SELECT input_hash,response FROM candidate_screening_authority_receipts WHERE actor_node_id=$1 AND request_id=$2`, [actor, value.requestId]);
      if (receipt) {
        if (receipt.input_hash !== fingerprint) throw new ConflictException("Request ID already used for different input");
        return receipt.response;
      }
      await this.initialize(String(target.user_node_id), db);
      await db.query(`SELECT user_node_id FROM candidate_screening_governance WHERE user_node_id=$1 FOR UPDATE`, [target.user_node_id]);
      if (operation === "feedback_verify") {
        const [existing] = await db.query(`SELECT feedback_id FROM candidate_screening_feedback_verifications WHERE feedback_id=$1`, [value.feedbackId]);
        if (existing) throw new ConflictException("Employer feedback has already been verified");
        await db.query(`INSERT INTO candidate_screening_feedback_verifications(feedback_id,actor_node_id,authority,organization_id,employer_case_id,evidence,evidence_hash) VALUES($1,$2,$3,$4,$5,$6,$7)`, [value.feedbackId, actor, authority, target.organization_id, value.employerCaseId!.trim(), value.evidence!.trim(), createHash("sha256").update(value.evidence!.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex")]);
      } else if (operation === "manager_context_set") {
        await db.query(`INSERT INTO candidate_screening_manager_contexts(id,user_node_id,short_uuid,organization_id,actor_node_id,authority,context_text,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [value.requestId, target.user_node_id, target.short_uuid, target.organization_id, actor, authority, value.text!.trim(), value.evidence!.trim()]);
      } else {
        await db.query(`INSERT INTO candidate_screening_manager_revocations(context_id,actor_node_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [value.contextId, actor]);
      }
      await db.query(`UPDATE candidate_screening_governance SET revision=revision+1 WHERE user_node_id=$1`, [target.user_node_id]);
      await this.audit(db, String(target.user_node_id), actor, operation, { requestId: value.requestId, feedbackId: value.feedbackId ?? null, contextId: value.contextId ?? null, authority });
      const response = { id: value.feedbackId ?? value.contextId ?? value.requestId, status: operation === "feedback_verify" ? "verified_employer" : operation === "manager_context_revoke" ? "revoked" : "authorized_manager_context", authority };
      await db.query(`INSERT INTO candidate_screening_authority_receipts(actor_node_id,request_id,input_hash,response) VALUES($1,$2,$3,$4)`, [actor, value.requestId, fingerprint, JSON.stringify(response)]);
      return response;
    });
  }
}
