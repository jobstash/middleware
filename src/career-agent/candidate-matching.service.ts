import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { recommendationCategoryAffinityCtes } from "src/postgres/sql/recommended-jobs.sql";
import { CareerRepository } from "./career.repository";
import { CvMatchService } from "./cv-match.service";
import { ScreeningAssessment, screeningRubricHash, screeningWeights } from "./job-screening";
import { ScreeningService, screeningEligibleJobsSql, screeningOriginalAdSql, screeningGeoContextSql, screeningShortlistRelevanceSql } from "./screening.service";
import { candidateMatchingMaxPageSize, candidateMatchingPageSize, candidateMatchingSorts, CandidateMatchingRefreshInput, CandidateMatchingResultsInput } from "./candidate-matching.dto";
import { aggregateCvImprovements, ImprovementAssessment } from "./cv-improvements";
import { SCREENING_SHORTLIST_VERSION } from "./screening-shortlist";
import { projectJobCardDetails } from "./job-card-details";
import { screeningContextSql } from "./screening-context";
import { screeningBatchDiagnostics } from "./screening-calibration";

type Json = Record<string, any>;
const text = (value: unknown, max = 500): string | null =>
  typeof value === "string" && value.trim() ? value.slice(0, max) : null;
const strings = (value: unknown, max = 20): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, max).map(v => v.slice(0, 1000)) : [];
const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const safeUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};

/** Original-ad eligibility is shared with screening, including live personal exclusions.
 * Embeddings order candidate generation only. Saved assessments, preferences and feedback
 * determine interview recommendations; neither vector similarity nor bounty is a fit percentage. */
@Injectable()
export class CandidateMatchingService {
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly cvMatch: CvMatchService,
    private readonly screening: ScreeningService,
  ) {}

  async assertEligible(wallet: string, shortUUID: string, documentId?: string): Promise<void> {
    const owner = await this.career.owner(wallet);
    const [job] = await this.db.query(
      `WITH candidate_geo AS MATERIALIZED (${screeningGeoContextSql("$1", "$2")})
       SELECT short_uuid FROM (${screeningEligibleJobsSql("(SELECT value FROM candidate_geo)")}) eligible WHERE short_uuid=$3
       AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM candidate_documents WHERE id=$2 AND user_node_id=$1))`,
      [owner, documentId ?? null, shortUUID],
    );
    if (!job) throw new NotFoundException("Eligible vacancy not found");
  }

  private async snapshot(wallet: string, input: CandidateMatchingResultsInput) {
    const owner = await this.career.owner(wallet);
    const context = await this.screening.candidateContext(owner, this.db, undefined, input.documentId);
    const preferences = JSON.parse(context);
    const profile = { revision: preferences.career?.revision ?? 0, preferences };
    const [document] = await this.db.query<Json>(
      `SELECT id,filename,content_hash AS "contentHash",source_text AS "sourceText",md5(${screeningContextSql("$3")}::text) AS "profileVersion"
       FROM candidate_documents WHERE id=$1 AND user_node_id=$2`,
      [input.documentId, owner, context],
    );
    if (!document) throw new NotFoundException("CV not found");
    const [connection] = await this.db.query<Json>(
      `SELECT c.id,c.provider FROM candidate_ai_connections c
       JOIN candidate_devices d ON d.id=c.device_id AND d.user_node_id=c.user_node_id AND d.status='active'
       WHERE c.user_node_id=$1 AND c.status='connected' AND c.public_state->>'execution'='device'
       AND ($2::uuid IS NULL OR c.id=$2) ORDER BY c.created_at DESC LIMIT 1`,
      [owner, input.connectionId ?? null],
    );
    const [run] = await this.db.query<Json>(
      `SELECT r.id,r.status,r.connection_id AS "connectionId",r.cv_hash AS "sourceVersion",
       r.candidate_context::jsonb AS preferences,md5(${screeningContextSql("r.candidate_context::jsonb-'candidate_search_goal'")}::text) AS "profileVersion",
       r.pause_reason AS "pauseReason",r.created_at AS "createdAt",
       CASE WHEN r.status='paused' AND r.pause_reason='Provider limit reached. Search will check again automatically after 30 minutes.'
         AND NOT EXISTS(SELECT 1 FROM candidate_screening_runs newer WHERE newer.user_node_id=r.user_node_id AND (newer.created_at,newer.id)>(r.created_at,r.id))
         THEN r.updated_at+interval '30 minutes' END AS "autoResumeAt",
       r.rubric_hash AS "rubricVersion",r.policy_snapshot AS "policySnapshot",r.evaluation_trial AS "evaluationTrial",
       count(j.id)::int AS total,count(j.id) FILTER(WHERE j.status='completed')::int AS assessed,
       count(j.id) FILTER(WHERE j.status='completed' AND (r.rubric_hash<>$5 OR j.assessment->'practical_eligibility' IS NULL OR j.assessment->'requirements' IS NULL))::int AS "outdatedAssessments",
       count(j.id) FILTER(WHERE j.status='completed' AND j.assessment->>'recommendation'='interview'
         AND j.assessment#>>'{practical_eligibility,status}'='eligible' AND j.assessment->'confirmed_hard_blockers'='[]'::jsonb)::int AS interview,
       count(j.id) FILTER(WHERE j.status='completed' AND j.assessment->>'recommendation'='reject')::int AS rejected,
       count(j.id) FILTER(WHERE j.status='unavailable')::int AS unavailable,
       count(j.id) FILTER(WHERE j.status='failed')::int AS failed,
       count(j.id) FILTER(WHERE j.status IN ('pending','running') OR (j.status='failed' AND COALESCE(j.attempt_count,0)<2))::int AS remaining,
       count(j.id) FILTER(WHERE j.status='failed' AND COALESCE(j.attempt_count,0)>=2)::int AS "terminalFailed",
       count(j.id) FILTER(WHERE q.status='running' AND q.heartbeat_at>clock_timestamp()-interval '45 seconds'
         AND EXISTS(SELECT 1 FROM candidate_ai_connections c JOIN candidate_devices d ON d.id=c.device_id
           WHERE c.id=r.connection_id AND c.user_node_id=r.user_node_id AND d.user_node_id=r.user_node_id
             AND d.status='active' AND c.device_id=q.device_id AND c.generation=q.connection_generation
             AND c.execution_lease=q.id AND c.execution_lease_until>clock_timestamp()))::int AS active
       FROM candidate_screening_runs r LEFT JOIN candidate_screening_jobs j ON j.run_id=r.id
       LEFT JOIN candidate_agent_requests q ON q.id=j.request_id
       WHERE r.user_node_id=$1 AND r.document_id=$2 AND ($3::uuid IS NULL OR r.id=$3)
         AND ($4::uuid IS NULL OR r.connection_id=$4)
       GROUP BY r.id ORDER BY r.created_at DESC,r.id LIMIT 1`,
      [owner, input.documentId, input.runId ?? null, input.connectionId ?? null, screeningRubricHash],
    );
    if (input.runId && !run) throw new NotFoundException("Assessment run not found");
    return { owner, document, profile, connection, run };
  }

  async refresh(wallet: string, input: CandidateMatchingRefreshInput) {
    if (input.mode === "append") {
      await this.screening.append(wallet, input);
      return this.results(wallet, input);
    }
    const state = await this.snapshot(wallet, input);
    await this.career.requireAdvanced(state.owner);
    if (state.profile.revision !== input.revision)
      throw new ConflictException("Career profile changed; reread it before refreshing recommendations.");
    if (!state.document.sourceText?.trim() || !state.connection)
      return this.results(wallet, input);
    if (input.runId && state.run.connectionId !== state.connection.id && !input.connectionId)
      throw new ConflictException("The saved run uses another provider connection. Explicitly choose the current connection for a new assessment.");
    // Screening owns source snapshots, reuse, cache keys, queueing and provider selection.
    // No inference takes place in this service or on a results poll.
    const run = await this.screening.start(wallet, input.documentId, state.connection.id, input);
    return this.results(wallet, { ...input, runId: run.id as string });
  }

  async results(wallet: string, input: CandidateMatchingResultsInput) {
    const offset = input.offset ?? 0, limit = input.limit ?? candidateMatchingPageSize;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > candidateMatchingMaxPageSize)
      throw new BadRequestException(`Use a nonnegative safe-integer offset and limit 1–${candidateMatchingMaxPageSize}.`);
    const sort = input.sort === undefined ? "recommended" : input.sort;
    if (!candidateMatchingSorts.includes(sort))
      throw new BadRequestException("Use recommended, score-desc or score-asc sorting.");
    for (const value of [input.minScore, input.maxScore])
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 100))
        throw new BadRequestException("Score bounds must be integers from 0 to 100.");
    if (input.minScore !== undefined && input.maxScore !== undefined && input.minScore > input.maxScore)
      throw new BadRequestException("minScore must not exceed maxScore.");
    const state = await this.snapshot(wallet, input);
    const { owner, document, profile, run } = state;
    const sourceVersion = createHash("sha256").update(document.sourceText ?? "").digest("hex");
    const catalogue = (await this.cvMatch.documents(wallet)).find(d => d.id === input.documentId);
    const directions = await this.career.directions(wallet);
    const selected = strings(directions.selected, 100);
    const currentPreferences = profile.preferences;
    const managerChanges = run ? await this.screening.managerContextChanges(owner, run.id) : [];
    const policyOutdated = !!run && !run.evaluationTrial && run.policySnapshot?.version !== (await this.screening.currentPolicy(owner)).version;
    const [ranked] = run ? await this.db.query<Json>(
      `WITH candidate_geo AS MATERIALIZED (${screeningGeoContextSql("$1", "$2")}), completed AS MATERIALIZED (
        SELECT s.id,s.short_uuid,s.job_node_id,s.assessment,s.assessment_at,s.model,s.reasoning_effort,
         s.additional_context,s.ad_hash,s.ordinal,c.provider,r.rubric_hash<>$8 AS "rubricOutdated",
         r.policy_snapshot AS "policySnapshot",capability.assessment AS capability,capability.id AS "capabilityId",
         capability.created_at AS "capabilityAssessedAt"
        FROM candidate_screening_jobs s
        JOIN candidate_screening_runs r ON r.id=s.run_id AND r.user_node_id=$1 AND r.document_id=$2
        JOIN candidate_ai_connections c ON c.id=r.connection_id
        JOIN candidate_screening_capabilities capability ON capability.id=s.capability_id
         AND capability.user_node_id=r.user_node_id AND capability.document_id=r.document_id
        WHERE s.run_id=$3 AND s.status='completed' AND s.assessment IS NOT NULL
         AND jsonb_typeof(s.assessment->'requirements')='array'
         AND r.candidate_context::jsonb#>>'{shortlist,version}'='${SCREENING_SHORTLIST_VERSION}'
         AND (r.candidate_context::jsonb#>'{shortlist,jobIds}') ? s.job_node_id::text
       ), target_user AS MATERIALIZED (SELECT $1::bigint AS id,now() AS ranked_at),
       ${recommendationCategoryAffinityCtes},
       assessed AS (
        SELECT s.id,s.short_uuid AS "shortUUID",s.job_node_id::text AS "jobId",e.title,e.company,e.payload,
         e.organization_id AS "organizationId",e.project_id AS "projectId",s.assessment,s.assessment_at AS "assessedAt",
         e.published_timestamp AS "publishedTimestamp",organization.payload AS "organizationPayload",project.payload AS "projectPayload",
         s.model,s.reasoning_effort AS "reasoningEffort",s.provider,s.additional_context::jsonb->'candidate_preferences' AS preferences,
         s."rubricOutdated",s."policySnapshot",s.capability,s."capabilityId",s."capabilityAssessedAt",
         md5(${screeningContextSql("(s.additional_context::jsonb->'candidate_preferences')-'candidate_search_goal'")}::text) AS "profileVersion",
         ${screeningContextSql("(s.additional_context::jsonb->'candidate_preferences')-'candidate_search_goal'")} IS DISTINCT FROM ${screeningContextSql("$4")} AS "profileOutdated",
         s.ad_hash IS DISTINCT FROM md5(ad.content) AS "adOutdated",
         s.short_uuid=ANY($14::text[]) AS "managerOutdated",
         EXISTS(SELECT 1 FROM jsonb_each_text(COALESCE(e.filter_labels->'classifications','{}')) cl WHERE cl.value=ANY($5::text[])) AS "selectedDirection",
         COALESCE((SELECT sum(a.weight) FROM jsonb_each_text(COALESCE(e.filter_labels->'classifications','{}')) cl JOIN classification_affinity a ON a.label_key=lower(cl.value)),0) AS affinity,
         s.ordinal
        FROM completed s
        JOIN LATERAL (
         SELECT * FROM (${screeningEligibleJobsSql("(SELECT value FROM candidate_geo)")}) eligible
         WHERE eligible.job_node_id=s.job_node_id
         AND (${screeningShortlistRelevanceSql("eligible", "$9::text[]", "$10::text[]")})
         OFFSET 0 -- Keep this an indexed, per-assessment eligibility check, not a full-catalogue join.
        ) e ON true
        LEFT JOIN organization_search_documents organization ON organization.organization_id=e.organization_id
        LEFT JOIN project_search_documents project ON project.project_id=e.project_id
        LEFT JOIN LATERAL(${screeningOriginalAdSql("e.job_node_id")}) ad ON true
       ), eligible AS MATERIALIZED (
        SELECT *,CASE WHEN (assessment->>'evidence_coverage')::int>0
         THEN (assessment->>'overall_score')::int END AS score
        FROM assessed
        WHERE assessment->>'recommendation'='interview'
         AND assessment->'confirmed_hard_blockers'='[]'::jsonb
         AND assessment#>>'{practical_eligibility,status}'='eligible'
       ), ranked AS (
        SELECT *,row_number() OVER(ORDER BY
         CASE WHEN $11::text='score-desc' THEN score END DESC NULLS LAST,
         CASE WHEN $11::text='score-asc' THEN score END ASC NULLS LAST,
         "profileOutdated","adOutdated","managerOutdated",score DESC NULLS LAST,
         "selectedDirection" DESC,affinity DESC,(assessment->>'evidence_coverage')::int DESC,ordinal,"shortUUID") AS position
        FROM eligible WHERE ($12::int IS NULL OR score >= $12) AND ($13::int IS NULL OR score <= $13)
       ) SELECT (SELECT count(*)::int FROM ranked) AS total,
        (SELECT count(*)::int FROM eligible) AS "unfilteredTotal",
        (SELECT count(*)::int FROM eligible WHERE "profileOutdated" OR "adOutdated" OR "managerOutdated") AS outdated,
        COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY position) FROM
         (SELECT * FROM ranked ORDER BY position LIMIT $6 OFFSET $7) page),'[]'::jsonb) AS jobs,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('shortUUID',"shortUUID",'title',title,'company',company,
          'assessedAt',"assessedAt",'assessment',assessment) ORDER BY ordinal,"shortUUID")
          FROM eligible WHERE NOT "profileOutdated" AND NOT "adOutdated" AND NOT "managerOutdated"),'[]'::jsonb) AS reviewed,
        (SELECT count(*)::int FROM eligible WHERE "profileOutdated" OR "adOutdated" OR "managerOutdated") AS "outdatedReviewed",
        md5(${screeningContextSql("$4")}::text) AS "profileVersion"`,
      [owner, input.documentId, run.id, JSON.stringify(currentPreferences), selected, limit, offset, screeningRubricHash,
        run.preferences.shortlist.categories, run.preferences.shortlist.roles,
        sort, input.minScore ?? null, input.maxScore ?? null, managerChanges],
    ) : [];
    const jobs = (ranked?.jobs ?? []).map((row: Json) => this.project(row, sourceVersion !== run.sourceVersion, currentPreferences, policyOutdated));
    const assessmentOutdated = !!run && (run.rubricVersion !== screeningRubricHash || run.outdatedAssessments > 0);
    const status = !document.sourceText?.trim() ? "needs-source"
      : ranked?.unfilteredTotal > 0 ? "ready"
      : !state.connection ? "connect"
      : !run || assessmentOutdated || policyOutdated || managerChanges.length > 0 || (run.status === "running" && (sourceVersion !== run.sourceVersion || document.profileVersion !== run.profileVersion)) ? "needs-refresh"
      : run.status === "running" ? run.active > 0 ? "running" : "queued"
      : run.status;
    const stale = !!run && (assessmentOutdated || policyOutdated || managerChanges.length > 0 || sourceVersion !== run.sourceVersion || document.profileVersion !== run.profileVersion || ranked?.outdated > 0);
    const newJobs = run ? await this.screening.newJobs(owner, document.id, run.id, run.preferences.shortlist) : 0;
    const improvementContextOutdated = !!run && (assessmentOutdated || policyOutdated || sourceVersion !== run.sourceVersion ||
      document.profileVersion !== run.profileVersion || run.preferences.shortlist.version !== SCREENING_SHORTLIST_VERSION);
    const reviewed: ImprovementAssessment[] = improvementContextOutdated ? [] : ranked?.reviewed ?? [];
    const batchScores = run ? await this.db.query<{ score: number | null; evidenceCoverage: number }>(
      `SELECT CASE WHEN (j.assessment->>'evidence_coverage')::int>0 THEN (j.assessment->>'overall_score')::int END AS score,
       COALESCE((j.assessment->>'evidence_coverage')::int,0) AS "evidenceCoverage"
       FROM candidate_screening_jobs j JOIN candidate_screening_runs r ON r.id=j.run_id
       WHERE r.id=$1 AND r.user_node_id=$2 AND j.status='completed' AND j.assessment IS NOT NULL`,
      [run.id, owner],
    ) : [];
    const scoreDiagnostics = screeningBatchDiagnostics(batchScores, "eligible_shortlist");
    const cvImprovements = {
      status: !run ? "empty" : improvementContextOutdated ? "stale"
        : run.status !== "completed" || run.failed > 0 || run.unavailable > 0 || ranked?.outdatedReviewed > 0 ? "partial" : "complete",
      documentId: document.id, runId: run?.id ?? null, reviewedJobs: reviewed.length,
      excludedStaleJobs: ranked?.outdatedReviewed ?? 0,
      items: aggregateCvImprovements(reviewed),
    };
    const nextActions: { operation: string; reason: string }[] = [];
    if (!document.sourceText?.trim()) nextActions.push({ operation: "source_text_create", reason: "Choose a source with original CV text, or paste your CV." });
    if (!state.connection) nextActions.push({ operation: "connection_setup", reason: "Connect your own reasoning provider to assess jobs." });
    if (run?.status === "running") nextActions.push({ operation: "recommendations_results", reason: "Read saved progress; polling does not start another model call." });
    if (document.sourceText?.trim() && state.connection && (!run || stale || run.status === "paused") && !run?.autoResumeAt)
      nextActions.push({ operation: "recommendations_refresh", reason: assessmentOutdated
        ? "Saved assessments use an earlier evaluation rubric. Start an updated search explicitly; existing results and history remain available."
        : stale ? "Inputs changed. Refresh using your current CV and preferences; saved results retain their original context." : "Assess eligible jobs with your own provider." });
    if (run && newJobs > 0 && !stale && !run.autoResumeAt)
      nextActions.push({ operation: "recommendations_refresh", reason: "Use mode:'append' with this runId to assess only newly eligible jobs; saved and unfinished assessments are retained." });
    return {
      status, run: run ? { id: run.id, status: run.status,
        availability: run.status === "running" ? run.active > 0 ? "processing" : "waiting_for_device" : null,
        pauseReason: run.pauseReason, createdAt: run.createdAt, autoResumeAt: run.autoResumeAt ?? null,
        total: run.total, assessed: run.assessed, interview: run.interview, rejected: run.rejected,
        unavailable: run.unavailable, failed: run.failed, active: run.active, outdatedAssessments: run.outdatedAssessments } : null,
      search: { total: run?.total ?? 0, processed: run?.assessed ?? 0, remaining: run?.remaining ?? 0,
        failed: run?.terminalFailed ?? 0, unavailable: run?.unavailable ?? 0, newJobs },
      context: { documentId: document.id, filename: document.filename, contentHash: document.contentHash, sourceVersion,
        assessedSourceVersion: run?.sourceVersion ?? null, profileRevision: profile.revision,
        searchGoal: run?.preferences?.candidate_search_goal ?? null,
        profileVersion: document.profileVersion, directions: selected, directionsSource: directions.source,
        preferences: this.preferences(currentPreferences), stale, assessmentOutdated, policyOutdated, managerContextOutdated: managerChanges.length > 0, retrievalStatus: catalogue?.status ?? "unavailable" },
      jobs, total: ranked?.total ?? 0, unfilteredTotal: ranked?.unfilteredTotal ?? 0, offset, limit, hasMore: offset < (ranked?.total ?? 0) - limit,
      cvImprovements, scoreDiagnostics,
      ranking: sort === "recommended"
        ? "Practically eligible saved interview recommendations without confirmed hard blockers, ordered by current context, assessment evidence, career directions and account feedback. Earlier-rubric evaluations are identified in context."
        : `Practically eligible saved interview recommendations ordered by saved agent evaluation score ${sort === "score-desc" ? "highest" : "lowest"} first, unscored jobs last; ties use current context, career directions and account feedback.`,
      nextActions,
    };
  }

  private preferences(value: Json) {
    return {
      sourceLocation: value.candidate_source_location ?? null,
      location: value.screening_location_preferences ?? null,
      categories: strings(value.job_categories), industries: strings(value.industries),
      directions: strings(value.career?.directions), profileRevision: value.career?.revision ?? null,
      minimumSalary: amount(value.minimum_salary), salaryCurrency: text(value.salary_currency, 3), salaryBasis: "annual",
      workAuthorization: text(value.work_authorization, 1000), requiresSponsorship: typeof value.requires_sponsorship === "boolean" ? value.requires_sponsorship : null,
    };
  }

  private project(row: Json, sourceOutdated: boolean, current: Json, policyOutdated: boolean) {
    const payload = row.payload ?? {}, assessment = row.assessment as ScreeningAssessment;
    const arrangement = payload.workArrangement ?? {};
    const options = ["remoteOptions", "hybridOptions", "onsiteOptions"].flatMap(key =>
      Array.isArray(arrangement[key]) ? arrangement[key].slice(0, 10) : []);
    const salary = { minimum: amount(payload.minimumSalary), maximum: amount(payload.maximumSalary), stated: amount(payload.salary), currency: text(payload.salaryCurrency, 3), basis: null };
    const unknowns = strings(assessment.priority_validation_questions);
    if (!salary.minimum && !salary.maximum && !salary.stated) unknowns.push("Employer salary is unstated.");
    if (!salary.currency) unknowns.push("Employer salary currency is unstated.");
    unknowns.push("Employer salary period must be checked in the original advertisement; no currency or annualization assumption was made.");
    if (!text(payload.location) && !options.length) unknowns.push("Employer location and eligible working locations are unstated.");
    if (!options.length || options.every(o => !strings(o.workAuthorizationRequirements).length)) unknowns.push("Employer work-authorization requirements are unstated; eligibility is not confirmed.");
    if (!options.length || options.some(o => !o.sponsorshipStatus || o.sponsorshipStatus === "unstated")) unknowns.push("Employer sponsorship availability is unstated.");
    return {
      id: row.shortUUID, shortUUID: row.shortUUID, jobId: row.jobId, assessmentId: row.id, title: row.title, company: row.company,
      score: assessment.evidence_coverage > 0 ? assessment.overall_score : null,
      evidenceCoverage: assessment.evidence_coverage,
      function: assessment.function,
      capability: { ...row.capability, id: row.capabilityId, assessedAt: row.capabilityAssessedAt },
      concerns: assessment.concerns,
      assessmentUnknowns: assessment.unknowns,
      claimCitations: assessment.claim_citations,
      seniorityComparison: assessment.seniority_comparison,
      organizationId: row.organizationId, projectId: row.projectId,
      details: projectJobCardDetails({ ...row, payload }),
      location: text(payload.location), workArrangement: {
        classification: text(arrangement.classification, 80),
        options: options.map(o => ({ mode: text(o.mode, 20), scope: text(o.scope, 30),
          includedCountries: strings(o.includedCountries), excludedCountries: strings(o.excludedCountries),
          includedRegions: strings(o.includedRegions), excludedRegions: strings(o.excludedRegions),
          officeCity: text(o.officeCity), residencyRequirements: strings(o.residencyRequirements),
          workAuthorizationRequirements: strings(o.workAuthorizationRequirements), sponsorshipStatus: text(o.sponsorshipStatus, 30) })),
      }, salary, applyUrl: payload.access === "protected" ? null : safeUrl(payload.url),
      recommendation: assessment.recommendation, reason: assessment.recommendation_reason,
      requirements: assessment.requirements, practicalEligibility: assessment.practical_eligibility,
      strengths: assessment.key_strengths, gaps: assessment.critical_gaps,
      evidenceQualifier: "These states describe source evidence and unresolved questions. Review the excerpts and gaps before deciding whether to apply.",
      evidence: assessment.metric_assessments.map(metric => {
        const candidateEvidence = metric.supporting_evidence.some(e => e.source === "candidate_cv");
        const status = metric.status !== "assessed" ? "unclear" : metric.gaps_or_questions.length
          ? candidateEvidence ? "partial" : "gap" : candidateEvidence ? "supported" : "unclear";
        return { dimension: metric.metric, status, confidence: metric.confidence, reason: metric.reason,
          score: metric.status === "assessed" ? assessment[metric.metric] : null,
          assessmentStatus: metric.status, weight: row.policySnapshot?.weights?.[metric.metric] ?? screeningWeights[metric.metric],
          excerpts: metric.supporting_evidence, questions: metric.gaps_or_questions };
      }),
      constraints: { hardBlockers: assessment.confirmed_hard_blockers, candidate: this.preferences(current) },
      unknowns: [...new Set(unknowns)],
      context: { sourceOutdated, profileOutdated: row.profileOutdated, adOutdated: row.adOutdated, rubricOutdated: row.rubricOutdated, managerOutdated: row.managerOutdated, policyOutdated,
        profileVersion: row.profileVersion, preferences: this.preferences(row.preferences ?? {}),
        searchGoal: row.preferences?.candidate_search_goal ?? null,
        assessedAt: row.assessedAt, provider: row.provider, model: row.model, reasoningEffort: row.reasoningEffort, selectedDirection: row.selectedDirection },
    };
  }
}
