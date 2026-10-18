import { screeningMetrics, ScreeningMetric } from "./job-screening";
import type { ScreeningPolicy } from "./screening-workflow";

const uuid = { type: "string", format: "uuid" };
const text = (maxLength: number, minLength = 1) => ({ type: "string", minLength, maxLength, pattern: "\\S" });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const mutation = (properties: Record<string, unknown>) => object({ requestId: uuid, revision: { type: "integer", minimum: 0 }, ...properties });
export const governanceGuidance = {
  demonstrated_scope: "For the selected dimension, distinguish demonstrated responsibility and outcomes from unsupported titles. Missing evidence remains unknown, not a negative fact.",
  transferable_evidence: "For the selected dimension, assess cited transferable experience against the actual responsibilities. Do not substitute employer prestige or exact keyword overlap for evidence.",
  role_responsibilities: "For the selected dimension, prioritize cited essential responsibilities over incidental tools or branding. Preserve practical eligibility and evidence requirements.",
} as const;
export const screeningGovernanceSchemas = {
  screening_governance_read: object({}),
  screening_feedback_report: mutation({ assessmentId: uuid, dimension: { enum: screeningMetrics }, outcome: { enum: ["reject", "interview"] }, evidence: text(8000, 20), employerCaseId: text(200) }),
  screening_policy_propose: mutation({ dimension: { enum: screeningMetrics }, feedbackIds: { type: "array", minItems: 4, maxItems: 30, uniqueItems: true, items: uuid }, weights: object(Object.fromEntries(screeningMetrics.map(metric => [metric, { type: "integer", minimum: 1, maximum: 40 }]))), guidance: { enum: Object.keys(governanceGuidance) }, rationale: text(2000, 20) }),
  screening_policy_approve: mutation({ proposalId: uuid }),
  screening_policy_validate: mutation({ proposalId: uuid }),
  screening_policy_rollback: mutation({ proposalId: uuid, reason: text(2000, 10) }),
};
export const screeningAuthoritySchemas = {
  authority_status: object({ shortUUID: text(128) }),
  authority_read: object({ candidateOwner: { type: "string", pattern: "^[1-9][0-9]*$" }, shortUUID: text(128) }),
  feedback_verify: object({ requestId: uuid, feedbackId: uuid, evidence: text(8000, 20), employerCaseId: text(200) }),
  manager_context_set: object({ requestId: uuid, candidateOwner: { type: "string", pattern: "^[1-9][0-9]*$" }, shortUUID: text(128), text: text(4000, 20), evidence: text(4000, 20) }),
  manager_context_revoke: object({ requestId: uuid, contextId: uuid }),
};
export type ScreeningGovernanceOperation = keyof typeof screeningGovernanceSchemas;
export type ScreeningAuthorityOperation = keyof typeof screeningAuthoritySchemas;
export type GovernanceInput = {
  requestId: string; revision: number; assessmentId?: string; dimension?: ScreeningMetric;
  outcome?: "reject" | "interview"; evidence?: string; employerCaseId?: string;
  feedbackIds?: string[]; weights?: Record<ScreeningMetric, number>;
  guidance?: keyof typeof governanceGuidance; rationale?: string; proposalId?: string; reason?: string;
};
export type AuthorityInput = { requestId?: string; feedbackId?: string; evidence?: string; employerCaseId?: string; candidateOwner?: string; shortUUID?: string; text?: string; contextId?: string };

export interface ScreeningGovernanceState {
  candidateOwner: string;
  revision: number;
  activePolicy: ScreeningPolicy;
  baseWeights: Record<ScreeningMetric, number>;
  feedback: Array<{ id: string; assessmentId: string; shortUUID: string; dimension: ScreeningMetric; outcome: "reject" | "interview"; prediction: "reject" | "interview"; evidence: string; employerCaseId: string; createdAt: string; status: "reported" | "verified_employer"; authority: "organization_owner" | "platform_admin" | null; verifiedAt: string | null }>;
  proposals: Array<{ id: string; dimension: ScreeningMetric; feedbackIds: string[]; snapshot: ScreeningPolicy; previousVersion: string; rationale: string; createdAt: string; status: "proposed" | "trial" | "validated" | "rolled_back"; approvedAt: string | null; validation: null | { status: "pending" | "improved" | "not_improved"; pairCount: number; baselineLoss: number | null; proposedLoss: number | null; assessmentPairs: Array<{ baselineId: string; proposedId: string; feedbackId: string }> } | { reason: string } }>;
  eligibility: Array<{ dimension: ScreeningMetric; distinctVacancies: number; distinctCases: number; distinctEvidence: number; eligible: boolean }>;
  managerContexts: Array<{ id: string; shortUUID: string; text: string; authority: "organization_owner" | "platform_admin"; createdAt: string; revoked: boolean; active: boolean }>;
  authority: { canVerifyEmployerFeedback: boolean; canApproveManagerContext: boolean; verificationRoute: string };
}

const timestamp = { type: "string", format: "date-time" };
const metric = { enum: screeningMetrics };
const weights = object(Object.fromEntries(screeningMetrics.map(key => [key, { type: "integer", minimum: 1, maximum: 40 }])));
const policy = object({ version: text(180), weights, guidance: text(2000) }, ["version"]);
const authority = { enum: ["organization_owner", "platform_admin"] };
const calibration = object({
  status: { enum: ["pending", "improved", "not_improved"] }, pairCount: { type: "integer", minimum: 0 },
  baselineLoss: { type: ["number", "null"], minimum: 0, maximum: 1 }, proposedLoss: { type: ["number", "null"], minimum: 0, maximum: 1 },
  assessmentPairs: { type: "array", items: object({ baselineId: uuid, proposedId: uuid, feedbackId: uuid }) },
});
export const screeningGovernanceStateSchema = object({
  candidateOwner: { type: "string", pattern: "^[1-9][0-9]*$" }, revision: { type: "integer", minimum: 0 }, activePolicy: policy, baseWeights: weights,
  feedback: { type: "array", maxItems: 200, items: object({
    id: uuid, assessmentId: uuid, shortUUID: text(128), dimension: metric, outcome: { enum: ["reject", "interview"] }, prediction: { enum: ["reject", "interview"] },
    evidence: text(8000), employerCaseId: text(200), createdAt: timestamp, status: { enum: ["reported", "verified_employer"] },
    authority: { enum: ["organization_owner", "platform_admin", null] }, verifiedAt: { anyOf: [timestamp, { type: "null" }] },
  }) },
  proposals: { type: "array", maxItems: 100, items: object({
    id: uuid, dimension: metric, feedbackIds: { type: "array", items: uuid }, snapshot: policy, previousVersion: text(180), rationale: text(2000),
    createdAt: timestamp, status: { enum: ["proposed", "trial", "validated", "rolled_back"] }, approvedAt: { anyOf: [timestamp, { type: "null" }] },
    validation: { anyOf: [{ type: "null" }, calibration, object({ reason: text(2000) })] },
  }) },
  eligibility: { type: "array", items: object({
    dimension: metric, distinctVacancies: { type: "integer", minimum: 0 }, distinctCases: { type: "integer", minimum: 0 },
    distinctEvidence: { type: "integer", minimum: 0 }, eligible: { type: "boolean" },
  }) },
  managerContexts: { type: "array", maxItems: 100, items: object({ id: uuid, shortUUID: text(128), text: text(4000), authority, createdAt: timestamp, revoked: { type: "boolean" }, active: { type: "boolean" } }) },
  authority: object({ canVerifyEmployerFeedback: { const: false }, canApproveManagerContext: { const: false }, verificationRoute: { const: "/profile/screening-authority/invoke" } }),
});
export const screeningGovernanceResponseSchemas = Object.fromEntries(Object.keys(screeningGovernanceSchemas).map(name => [name, screeningGovernanceStateSchema]));
export const screeningAuthorityResponseSchemas = {
  authority_status: object({ shortUUID: text(128), authority: { enum: ["organization_owner", "platform_admin", null] }, canVerifyEmployerFeedback: { type: "boolean" }, canApproveManagerContext: { type: "boolean" } }),
  authority_read: object({
    candidateOwner: { type: "string", pattern: "^[1-9][0-9]*$" }, shortUUID: text(128), authority,
    feedback: { type: "array", maxItems: 200, items: object({
      id: uuid, candidateOwner: { type: "string", pattern: "^[1-9][0-9]*$" }, assessmentId: uuid, dimension: metric, outcome: { enum: ["reject", "interview"] }, prediction: { enum: ["reject", "interview"] },
      evidence: text(8000), employerCaseId: text(200), status: { enum: ["reported", "verified_employer"] },
    }) },
    managerContexts: { type: "array", maxItems: 100, items: object({ id: uuid, text: text(4000), authority, revoked: { type: "boolean" } }) },
  }),
  feedback_verify: object({ id: uuid, status: { const: "verified_employer" }, authority }),
  manager_context_set: object({ id: uuid, status: { const: "authorized_manager_context" }, authority }),
  manager_context_revoke: object({ id: uuid, status: { const: "revoked" }, authority }),
};
