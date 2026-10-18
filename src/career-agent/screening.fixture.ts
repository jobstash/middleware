import { PracticalEligibility, ScreeningAssessment } from "./job-screening";
import { CANDIDATE_SOURCE_MATCHING_VERSION } from "./candidate-source-location";
import { CandidateCapabilityAssessment, ScreeningEvidenceBundle, ScreeningFunction, SourceCitation } from "./screening-workflow";

export function screeningEvidenceFixture(candidateExcerpt: string, jobExcerpt: string, functionKey: ScreeningFunction = "engineering"): ScreeningEvidenceBundle {
  return {
    function: functionKey,
    function_basis: { claim: "The role's documented responsibilities establish its function.", citations: [{ source: "job_description", excerpt: jobExcerpt }] },
    candidate_facts: [{ claim: "Documented candidate work.", citations: [{ source: "candidate_cv", excerpt: candidateExcerpt }] }],
    role_requirements: [{ claim: "Documented role responsibilities.", citations: [{ source: "job_description", excerpt: jobExcerpt }] }],
    preference_facts: [],
    employer_facts: [], employment: [], unknowns: ["Employment chronology is not established by this fixture."], concerns: [], injection_observations: [],
  };
}

export function candidateCapabilityFixture(candidateExcerpt: string, functionKey: ScreeningFunction = "engineering"): CandidateCapabilityAssessment {
  return {
    function: functionKey, score: 80, evidence_coverage: 33,
    dimensions: [
      { dimension: "craft", score: 80, status: "assessed", reason: "Documented professional work.", citations: [{ source: "candidate_cv", excerpt: candidateExcerpt }] },
      { dimension: "responsibility", score: null, status: "unknown", reason: "Accountability is not documented.", citations: [] },
      { dimension: "outcomes", score: null, status: "unknown", reason: "Attributable outcomes require validation.", citations: [] },
    ],
    concerns: [], unknowns: ["Validate responsibility and attributable outcomes."],
  };
}

export function screeningFitClaimsFixture(candidateExcerpt: string, jobExcerpt: string): Pick<ScreeningAssessment, "function" | "concerns" | "unknowns" | "claim_citations"> {
  const candidate: SourceCitation = { source: "candidate_cv", excerpt: candidateExcerpt };
  const role: SourceCitation = { source: "job_description", excerpt: jobExcerpt };
  return {
    function: "engineering", concerns: [], unknowns: ["Validate undocumented dimensions."],
    claim_citations: [
      { path: "/recommendation_reason", citations: [candidate, role] },
      { path: "/seniority_comparison/required_responsibility_scope", citations: [role] },
      { path: "/seniority_comparison/demonstrated_candidate_scope", citations: [candidate] },
      { path: "/seniority_comparison/material_difference", citations: [candidate, role] },
      { path: "/key_strengths/0", citations: [candidate] },
    ],
  };
}

export function screeningEligibilityFixture(jobExcerpt: string, remoteWorldwide = false): Pick<ScreeningAssessment, "requirements" | "practical_eligibility"> {
  const status = remoteWorldwide ? "eligible" : "unresolved";
  return {
    requirements: [{ requirement: "Advertised responsibility", kind: "responsibility", priority: "must_have", state: "unknown", candidate_scope: "unknown",
      job_evidence: [{ source: "job_description", excerpt: jobExcerpt }], candidate_evidence: [] }],
    practical_eligibility: {
      status, reason: remoteWorldwide ? "Worldwide remote work is explicitly available." : "The workplace needs clarification.", relocation_required: remoteWorldwide ? false : null,
      candidate: { current_location: null, relocation: "unknown", relocation_destinations: [], work_authorization: null, requires_sponsorship: null, evidence: [] },
      job: { workplace_type: remoteWorldwide ? "remote" : "unknown", workplace_locations: [], remote_regions: remoteWorldwide ? ["Worldwide"] : [], residency_requirements: [], timezone_requirements: [], onsite_attendance: null, work_authorization: null, sponsorship: "unknown", evidence: remoteWorldwide ? [{ source: "job_description", excerpt: "Remote worldwide." }] : [] },
      checks: (["workplace", "remote_region", "residency", "timezone", "onsite_attendance", "work_authorization", "sponsorship"] as PracticalEligibility["checks"][number]["constraint"][])
        .map(constraint => ({ constraint, status, reason: remoteWorldwide ? "No incompatible restriction is imposed by the supplied ad." : "Confirm the actual constraint.", evidence: [] })),
    },
  };
}

export async function bindScreeningSourceFixture(db: { query(sql: string, parameters?: unknown[]): Promise<unknown> }, documentId: string): Promise<void> {
  await db.query(`UPDATE candidate_documents SET parsed_result=jsonb_build_object(
    'matchingContext',jsonb_build_object('version',${CANDIDATE_SOURCE_MATCHING_VERSION},'contentHash',content_hash,'sourceTextHash',md5(COALESCE(source_text,'')),'projectionText',COALESCE(source_text,''),'projectionHash',md5(COALESCE(source_text,'')),'sourceProvenance',COALESCE(extraction_provenance,'null'::jsonb),'mode','text'),
    'location',NULL,'sourceGrounding',jsonb_build_object('currentResidence',NULL,'relocation',NULL,'workAuthorization',NULL,'requiresSponsorship',NULL),
    'preferences',jsonb_build_object('relocation',NULL,'relocationDestinations','[]'::jsonb,'residenceCountry',NULL,'workAuthorization',NULL,'requiresSponsorship',NULL))
    WHERE id=$1`, [documentId]);
}
