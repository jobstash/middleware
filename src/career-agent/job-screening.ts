import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Ajv from "ajv";
import { candidateCapabilityPrompt, candidateCapabilitySchema, encodeScreeningData, functionRubrics, parseCandidateCapability, parseScreeningEvidence, screeningDeliveryInstructions, screeningEvidencePrompt, screeningEvidenceSchema, screeningFunctions, screeningSecurityInstructions, sourceCitationSchema, verifySourceCitation } from "./screening-workflow";
import type { ScreeningEvidenceBundle, ScreeningFunction, ScreeningPolicy, ScreeningPromptOptions, ScreeningSources, SourceCitation } from "./screening-workflow";

export const screeningWeights = {
  location_fit: 10,
  technical_fit: 25,
  factual_seniority_fit: 20,
  culture_fit_company_size: 5,
  culture_fit_company_phase: 5,
  fitness_for_role: 20,
  potential_to_grow_into_role: 5,
} as const;
export type ScreeningMetric = keyof typeof screeningWeights;
export const screeningMetrics = Object.keys(
  screeningWeights,
) as ScreeningMetric[];
export function effectiveScreeningWeights(policy?: ScreeningPolicy): Record<ScreeningMetric, number> {
  const weights = policy?.weights ?? screeningWeights;
  if (Object.keys(weights).length !== screeningMetrics.length ||
      screeningMetrics.some(metric => !Number.isFinite(weights[metric]) || weights[metric] <= 0 || weights[metric] > 100))
    throw new Error("Approved screening weights must include exactly every dimension with a positive finite weight up to 100.");
  return weights;
}
const originalPrompt = readFileSync(
  join(__dirname, "assets/job-screening-prompt.txt"),
  "utf8",
);
export function screeningAdText(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?:br|\/p|\/li|\/div|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}
export const screeningRubricHash = createHash("sha256")
  .update(originalPrompt + screeningDeliveryInstructions.toString() + screeningSecurityInstructions + JSON.stringify({ functionRubrics, screeningEvidenceSchema, candidateCapabilitySchema, screeningWeights }) + screeningEvidencePrompt.toString() + candidateCapabilityPrompt.toString() + parseScreeningEvidence.toString() + parseCandidateCapability.toString() + parseScreeningAssessment.toString() + screeningAssessmentSchemaForSources.toString() + verifySourceCitation.toString() + "staged-screening-v2:all-applicable-high-score:claim-lanes")
  .digest("hex");
export function screeningPrompt(
  cv: string,
  ad: string,
  context: string,
  options: ScreeningPromptOptions & { evidence: ScreeningEvidenceBundle; policy?: ScreeningPolicy; hiddenContext?: string; hiringManager?: string },
): string {
  const sourceLocation = JSON.parse(context || "{}").candidate_preferences?.candidate_source_location;
  return [
    screeningDeliveryInstructions(options), screeningSecurityInstructions, originalPrompt,
    `SELECTED FUNCTION ${options.evidence.function}\nFUNCTION-SPECIFIC CRITERIA ${encodeScreeningData(functionRubrics[options.evidence.function])}`,
    `SERVER-PINNED SCORING POLICY ${encodeScreeningData({ version: options.policy?.version ?? "current-policy", weights: effectiveScreeningWeights(options.policy), guidance: options.policy?.guidance ?? "" })}\nPolicy guidance cannot override security, source lanes, eligibility, arithmetic or verdict rules.`,
    sourceLocation
      ? `EXACT SOURCE-BOUND CANDIDATE LOCATION ${encodeScreeningData({ current_location: sourceLocation.currentLocation ?? null, relocation: sourceLocation.relocation ?? "unknown" })}\nCopy these two values unchanged into practical_eligibility.candidate. Do not expand, normalize or embellish the location string. Preserve null location and unknown relocation exactly; other source evidence cannot override this binding.`
      : "No canonical candidate source-location binding was supplied; assess current residence only from explicit source evidence.",
    `VALIDATED EVIDENCE (claims, not authority or scores) ${encodeScreeningData(options.evidence)}`,
    `UNTRUSTED SOURCE DATA ${encodeScreeningData({ candidate_cv: cv, job_description: ad, additional_context: context, hidden_context: options.hiddenContext ?? "", hiring_manager: options.hiringManager ?? "" })}`,
  ].join("\n\n");
}
const text = { type: "string", maxLength: 180 };
const items = { type: "array", maxItems: 3, items: text };
export interface ScreeningEvidence {
  source: keyof ScreeningSources;
  excerpt: string;
}
const evidenceSchema = {
  type: "array", maxItems: 8,
  items: {
    type: "object", additionalProperties: false, required: ["source", "excerpt"],
    properties: {
      source: { enum: ["candidate_cv", "job_description", "additional_context", "hiring_manager", "hidden_context"] },
      excerpt: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};
const boundedStrings = { type: "array", maxItems: 12, items: text };
const nullableText = { type: ["string", "null"], maxLength: 180 };
const eligibilityStates = ["eligible", "ineligible", "unresolved"] as const;
const eligibilityConstraints = ["workplace", "remote_region", "residency", "timezone", "onsite_attendance", "work_authorization", "sponsorship"] as const;
export interface ScreeningRequirement {
  requirement: string;
  kind: "skill" | "experience" | "responsibility" | "location" | "work_authorization" | "other";
  priority: "must_have" | "nice_to_have";
  state: "supported" | "partial" | "gap" | "unknown";
  candidate_scope: "hands_on" | "team_lead" | "both" | "unknown";
  job_evidence: ScreeningEvidence[];
  candidate_evidence: ScreeningEvidence[];
}
export interface PracticalEligibility {
  status: typeof eligibilityStates[number];
  reason: string;
  relocation_required: boolean | null;
  candidate: {
    current_location: string | null;
    relocation: "unknown" | "not_open" | "specific_locations" | "open_anywhere";
    relocation_destinations: string[];
    work_authorization: string | null;
    requires_sponsorship: boolean | null;
    evidence: ScreeningEvidence[];
  };
  job: {
    workplace_type: "remote" | "onsite" | "hybrid" | "unknown";
    workplace_locations: string[];
    remote_regions: string[];
    residency_requirements: string[];
    timezone_requirements: string[];
    onsite_attendance: string | null;
    work_authorization: string | null;
    sponsorship: "available" | "unavailable" | "unknown";
    evidence: ScreeningEvidence[];
  };
  checks: {
    constraint: typeof eligibilityConstraints[number];
    status: typeof eligibilityStates[number];
    reason: string;
    evidence: ScreeningEvidence[];
  }[];
}
const practicalEligibilitySchema = {
  type: "object", additionalProperties: false,
  required: ["status", "reason", "relocation_required", "candidate", "job", "checks"],
  properties: {
    status: { enum: eligibilityStates }, reason: text,
    relocation_required: { type: ["boolean", "null"] },
    candidate: {
      type: "object", additionalProperties: false,
      required: ["current_location", "relocation", "relocation_destinations", "work_authorization", "requires_sponsorship", "evidence"],
      properties: {
        current_location: nullableText,
        relocation: { enum: ["unknown", "not_open", "specific_locations", "open_anywhere"] },
        relocation_destinations: boundedStrings, work_authorization: nullableText,
        requires_sponsorship: { type: ["boolean", "null"] }, evidence: evidenceSchema,
      },
    },
    job: {
      type: "object", additionalProperties: false,
      required: ["workplace_type", "workplace_locations", "remote_regions", "residency_requirements", "timezone_requirements", "onsite_attendance", "work_authorization", "sponsorship", "evidence"],
      properties: {
        workplace_type: { enum: ["remote", "onsite", "hybrid", "unknown"] },
        workplace_locations: boundedStrings, remote_regions: boundedStrings,
        residency_requirements: boundedStrings, timezone_requirements: boundedStrings,
        onsite_attendance: nullableText, work_authorization: nullableText,
        sponsorship: { enum: ["available", "unavailable", "unknown"] }, evidence: evidenceSchema,
      },
    },
    checks: {
      type: "array", minItems: eligibilityConstraints.length, maxItems: eligibilityConstraints.length,
      items: {
        type: "object", additionalProperties: false, required: ["constraint", "status", "reason", "evidence"],
        properties: {
          constraint: { enum: eligibilityConstraints }, status: { enum: eligibilityStates },
          reason: text, evidence: evidenceSchema,
        },
      },
    },
  },
};
export const screeningAssessmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "function", "concerns", "unknowns", "claim_citations",
    ...screeningMetrics,
    "overall_score",
    "recommendation",
    "recommendation_reason",
    "evidence_coverage",
    "metric_assessments",
    "seniority_comparison",
    "confirmed_hard_blockers",
    "key_strengths",
    "critical_gaps",
    "priority_validation_questions",
    "requirements",
    "practical_eligibility",
  ],
  properties: {
    function: { enum: screeningFunctions },
    concerns: boundedStrings,
    unknowns: boundedStrings,
    claim_citations: {
      type: "array", maxItems: 40,
      items: {
        type: "object", additionalProperties: false, required: ["path", "citations"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 180 },
          citations: { type: "array", minItems: 1, maxItems: 8, items: sourceCitationSchema },
        },
      },
    },
    ...Object.fromEntries(
      [...screeningMetrics, "evidence_coverage"].map(k => [
        k,
        { type: "integer", minimum: 0, maximum: 100 },
      ]),
    ),
    overall_score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
    recommendation: { enum: ["interview", "reject"] },
    recommendation_reason: { type: "string", maxLength: 320 },
    metric_assessments: {
      type: "array",
      minItems: screeningMetrics.length,
      maxItems: screeningMetrics.length,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "metric",
          "status",
          "confidence",
          "reason",
          "supporting_evidence",
          "gaps_or_questions",
        ],
        properties: {
          metric: { enum: screeningMetrics },
          status: { enum: ["assessed", "unknown", "not_applicable"] },
          confidence: { enum: ["high", "medium", "low"] },
          reason: text,
          supporting_evidence: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "excerpt"],
              properties: {
                source: {
                  enum: [
                    "candidate_cv",
                    "job_description",
                    "additional_context",
                    "hiring_manager",
                    "hidden_context",
                  ],
                },
                excerpt: { type: "string", minLength: 1, maxLength: 200 },
              },
            },
          },
          gaps_or_questions: { type: "array", maxItems: 2, items: text },
        },
      },
    },
    seniority_comparison: {
      type: "object",
      additionalProperties: false,
      required: [
        "required_responsibility_scope",
        "demonstrated_candidate_scope",
        "material_difference",
      ],
      properties: {
        required_responsibility_scope: text,
        demonstrated_candidate_scope: text,
        material_difference: text,
      },
    },
    confirmed_hard_blockers: { type: "array", maxItems: 8, items: text },
    key_strengths: items,
    critical_gaps: items,
    priority_validation_questions: items,
    requirements: {
      type: "array", minItems: 1, maxItems: 24,
      items: {
        type: "object", additionalProperties: false,
        required: ["requirement", "kind", "priority", "state", "candidate_scope", "job_evidence", "candidate_evidence"],
        properties: {
          requirement: text,
          kind: { enum: ["skill", "experience", "responsibility", "location", "work_authorization", "other"] },
          priority: { enum: ["must_have", "nice_to_have"] },
          state: { enum: ["supported", "partial", "gap", "unknown"] },
          candidate_scope: { enum: ["hands_on", "team_lead", "both", "unknown"] },
          job_evidence: { ...evidenceSchema, minItems: 1 }, candidate_evidence: evidenceSchema,
        },
      },
    },
    practical_eligibility: practicalEligibilitySchema,
  },
};
export function screeningAssessmentSchemaForSources(sources: ScreeningSources): typeof screeningAssessmentSchema {
  const sourceLocation = JSON.parse(sources.additional_context || "{}").candidate_preferences?.candidate_source_location;
  if (!sourceLocation) return screeningAssessmentSchema;
  const candidateProperties = {
    ...practicalEligibilitySchema.properties.candidate.properties,
    current_location: { ...practicalEligibilitySchema.properties.candidate.properties.current_location, const: sourceLocation.currentLocation ?? null },
    relocation: { ...practicalEligibilitySchema.properties.candidate.properties.relocation, const: sourceLocation.relocation ?? "unknown" },
  };
  const schema = {
    ...screeningAssessmentSchema,
    properties: {
      ...screeningAssessmentSchema.properties,
      practical_eligibility: {
        ...practicalEligibilitySchema,
        properties: {
          ...practicalEligibilitySchema.properties,
          candidate: { ...practicalEligibilitySchema.properties.candidate, properties: candidateProperties },
        },
      },
    },
  };
  return schema;
}
export interface ScreeningAssessment extends Record<ScreeningMetric, number> {
  function: ScreeningFunction;
  concerns: string[];
  unknowns: string[];
  claim_citations: { path: string; citations: SourceCitation[] }[];
  overall_score: number | null;
  evidence_coverage: number;
  recommendation: "interview" | "reject";
  recommendation_reason: string;
  metric_assessments: {
    metric: ScreeningMetric;
    status: "assessed" | "unknown" | "not_applicable";
    confidence: "high" | "medium" | "low";
    reason: string;
    supporting_evidence: ScreeningEvidence[];
    gaps_or_questions: string[];
  }[];
  seniority_comparison: {
    required_responsibility_scope: string;
    demonstrated_candidate_scope: string;
    material_difference: string;
  };
  confirmed_hard_blockers: string[];
  key_strengths: string[];
  critical_gaps: string[];
  priority_validation_questions: string[];
  requirements: ScreeningRequirement[];
  practical_eligibility: PracticalEligibility;
}
const validate = new Ajv({ allErrors: true }).compile(
  screeningAssessmentSchema,
);
export function parseScreeningAssessment(
  raw: string,
  sources: ScreeningSources,
  options?: { evidence?: ScreeningEvidenceBundle; policy?: ScreeningPolicy },
): ScreeningAssessment {
  let value: unknown;
  try {
    value = JSON.parse(raw.trim());
  } catch {
    throw new Error(
      "The evaluator did not return valid JSON. Resume to retry this job.",
    );
  }
  if (!validate(value)) {
    const details = (validate.errors ?? []).slice(0, 8)
      .map(issue => `${issue.dataPath || "assessment"} ${issue.message}`)
      .join("; ");
    throw new Error(`The evaluator returned an incomplete assessment: ${details}. Correct these fields using the advertised schema and retry.`);
  }
  const assessment = value as ScreeningAssessment;
  if (options?.evidence && assessment.function !== options.evidence.function)
    throw new Error("Fit function must match the collected role function.");
  const weights = effectiveScreeningWeights(options?.policy);
  const eligibility = assessment.practical_eligibility;
  const suppliedContext = JSON.parse(sources.additional_context || "{}");
  const locationContext = suppliedContext.candidate_preferences?.candidate_source_location;
  if (locationContext) {
    if (eligibility.candidate.current_location !== (locationContext.currentLocation ?? null) ||
        eligibility.candidate.relocation !== (locationContext.relocation ?? "unknown"))
      throw new Error("Use the supplied source-backed current location and explicit relocation consent unchanged.");
  }
  const evidence = [
    ...assessment.requirements.flatMap(requirement => [...requirement.job_evidence, ...requirement.candidate_evidence]),
    ...eligibility.candidate.evidence, ...eligibility.job.evidence,
    ...eligibility.checks.flatMap(check => check.evidence),
  ];
  const verifyEvidence = (quote: ScreeningEvidence, dimension: string): void => {
    verifySourceCitation(quote, sources, ["candidate_cv", "job_description", "additional_context", "hiring_manager"]);
  };
  for (const quote of evidence) verifyEvidence(quote, "requirements/eligibility");
  const candidateContext = JSON.stringify({ candidate_preferences: suppliedContext.candidate_preferences ?? {} });
  const jobGeography = JSON.stringify({ job_geography: suppliedContext.job_geography ?? {} });
  const candidateQuote = (quote: ScreeningEvidence): boolean =>
    quote.source === "candidate_cv" || quote.source === "additional_context" && candidateContext.includes(quote.excerpt);
  const workplaceQuote = (quote: ScreeningEvidence): boolean =>
    quote.source === "job_description" || quote.source === "additional_context" && jobGeography.includes(quote.excerpt);
  for (const requirement of assessment.requirements) {
    if (requirement.job_evidence.some(quote => quote.source !== "job_description" && quote.source !== "hiring_manager" &&
        (!["location", "work_authorization"].includes(requirement.kind) || !workplaceQuote(quote))))
      throw new Error("Role requirements must cite the original job description or canonical workplace requirements.");
    if (requirement.candidate_evidence.some(quote => !candidateQuote(quote)))
      throw new Error("Candidate capability must cite the CV or candidate preferences, not employer data.");
    if (["skill", "experience", "responsibility"].includes(requirement.kind) &&
        requirement.candidate_evidence.some(quote => quote.source !== "candidate_cv"))
      throw new Error("Professional qualifications must cite the CV, not search preferences.");
    if (requirement.state !== "unknown" && !requirement.candidate_evidence.length)
      throw new Error("A supported, partial or gap requirement needs candidate evidence; missing information is unknown.");
  }
  if (eligibility.candidate.relocation !== "unknown" && !eligibility.candidate.evidence.length)
    throw new Error("Explicit relocation choices need candidate source evidence.");
  if (eligibility.candidate.evidence.some(quote => !candidateQuote(quote)) ||
      eligibility.job.evidence.some(quote => !workplaceQuote(quote)))
    throw new Error("Candidate and workplace facts must cite their respective sources, not company headquarters.");
  if (eligibility.checks.some(check => check.evidence.some(quote => !candidateQuote(quote) && !workplaceQuote(quote))))
    throw new Error("Practical eligibility checks must cite candidate or workplace evidence, not employer background.");
  if (new Set(eligibility.checks.map(check => check.constraint)).size !== eligibilityConstraints.length)
    throw new Error("Evaluate each practical eligibility constraint exactly once.");
  const aggregate = eligibility.checks.some(check => check.status === "ineligible") ? "ineligible"
    : eligibility.checks.some(check => check.status === "unresolved") ? "unresolved" : "eligible";
  if (eligibility.status !== aggregate)
    throw new Error("Practical eligibility must retain every unresolved or incompatible constraint.");
  if (eligibility.relocation_required === true &&
      (eligibility.candidate.relocation === "unknown" || eligibility.candidate.relocation === "not_open") &&
      eligibility.status === "eligible")
    throw new Error("Required relocation without explicit candidate consent cannot be eligible.");
  if (eligibility.relocation_required === true &&
      eligibility.candidate.relocation === "specific_locations" &&
      !eligibility.candidate.relocation_destinations.length && eligibility.status === "eligible")
    throw new Error("Required relocation needs an explicitly permitted destination.");
  if (eligibility.status === "eligible" &&
      (eligibility.job.workplace_type === "unknown" || !eligibility.job.evidence.length))
    throw new Error("Eligible work arrangements need original-ad or canonical workplace evidence, not headquarters.");
  if (
    new Set(assessment.metric_assessments.map(m => m.metric)).size !==
    screeningMetrics.length
  )
    throw new Error("The evaluator must assess each dimension exactly once.");
  let weighted = 0,
    assessed = 0,
    applicable = 0;
  for (const metric of assessment.metric_assessments) {
    const weight = weights[metric.metric];
    if (metric.status === "not_applicable" && !["culture_fit_company_size", "culture_fit_company_phase"].includes(metric.metric))
      throw new Error("Core fit dimensions cannot be marked not_applicable; missing evidence is unknown.");
    if (metric.status === "not_applicable" && (!metric.reason.trim() ||
        !metric.supporting_evidence.some(quote => quote.source === "job_description" || quote.source === "hiring_manager")))
      throw new Error("Inapplicability needs explicit role evidence; missing company context is unknown.");
    if (metric.status !== "not_applicable") applicable += weight;
    if (metric.status === "assessed") {
      if (!metric.supporting_evidence.length)
        throw new Error("An assessed dimension needs source evidence.");
      if (!metric.supporting_evidence.some(candidateQuote) ||
          !metric.supporting_evidence.some(quote => quote.source === "job_description" || quote.source === "hiring_manager" || quote.source === "additional_context" && !candidateQuote(quote)))
        throw new Error("Assessed fit dimensions need both candidate and role/employer evidence in their own source lanes.");
      if (["technical_fit", "factual_seniority_fit", "fitness_for_role", "potential_to_grow_into_role"].includes(metric.metric) &&
          !metric.supporting_evidence.some(quote => quote.source === "candidate_cv"))
        throw new Error("Professional fit dimensions need CV evidence, not search preferences.");
      assessed += weight;
      weighted += weight * assessment[metric.metric];
    } else if (assessment[metric.metric] !== 0)
      throw new Error("Unknown and inapplicable dimensions must use 0.");
    for (const quote of metric.supporting_evidence) verifyEvidence(quote, metric.metric);
  }
  // Arithmetic is authoritative; component judgments and recommendations remain the user's model's work.
  const calculatedScore = assessed ? Math.round(weighted / assessed) : null;
  const deferredHighScore = calculatedScore !== null && calculatedScore >= 90 &&
    (assessed !== applicable || assessment.metric_assessments.some(metric => metric.status === "assessed" && metric.confidence !== "high"));
  const expectedScore = deferredHighScore ? null : calculatedScore;
  if (expectedScore === null && assessment.overall_score !== null)
    throw new Error("Submit overall_score null when no meaningful aggregate is available or 90+ lacks high-confidence evidence on every applicable dimension; preserve component scores and explain the unknowns.");
  if (assessment.overall_score !== null && assessment.overall_score >= 90 && assessment.overall_score !== expectedScore)
    throw new Error("A claimed 90+ aggregate must match the evidence-backed server calculation.");
  if (expectedScore === null && (!assessment.unknowns.some(unknown => unknown.trim()) || !assessment.recommendation_reason.trim()))
    throw new Error("A withheld aggregate requires explicit unknowns and a recommendation explanation.");
  assessment.overall_score = expectedScore;
  assessment.evidence_coverage = applicable
    ? Math.round((100 * assessed) / applicable)
    : 0;
  if (assessment.metric_assessments.some(metric => metric.status === "unknown") && !assessment.unknowns.length)
    throw new Error("Unknown dimensions require explicit unknowns.");
  const claims: Record<string, { text: string; lane: "candidate" | "role" | "both" }> = {
    "/recommendation_reason": { text: assessment.recommendation_reason, lane: "both" },
    "/seniority_comparison/required_responsibility_scope": { text: assessment.seniority_comparison.required_responsibility_scope, lane: "role" },
    "/seniority_comparison/demonstrated_candidate_scope": { text: assessment.seniority_comparison.demonstrated_candidate_scope, lane: "candidate" },
    "/seniority_comparison/material_difference": { text: assessment.seniority_comparison.material_difference, lane: "both" },
  };
  for (const key of ["confirmed_hard_blockers", "key_strengths", "critical_gaps", "concerns"] as const)
    assessment[key].forEach((text, index) => { claims[`/${key}/${index}`] = { text, lane: key === "key_strengths" ? "candidate" : "both" }; });
  const cited = new Set<string>();
  for (const link of assessment.claim_citations) {
    const target = claims[link.path];
    if (!target?.text || cited.has(link.path)) throw new Error("Claim citation paths must uniquely identify populated summary claims.");
    cited.add(link.path);
    for (const citation of link.citations) verifyEvidence(citation, link.path);
    const hasCandidate = link.citations.some(candidateQuote);
    const hasRole = link.citations.some(citation => citation.source === "job_description" || citation.source === "hiring_manager" || citation.source === "additional_context" && !candidateQuote(citation));
    if (target.lane !== "role" && !hasCandidate || target.lane !== "candidate" && !hasRole)
      throw new Error("Summary claims require citations in their candidate/role source lanes.");
    if (target.lane === "candidate" && link.citations.some(citation => !candidateQuote(citation)))
      throw new Error("Candidate summary claims cannot cite employer data.");
    if (target.lane === "role" && link.citations.some(candidateQuote))
      throw new Error("Role summary claims cannot cite candidate data.");
  }
  if (Object.entries(claims).some(([path, claim]) => claim.text && !cited.has(path)))
    throw new Error("Every populated summary claim needs exact linked citations.");
  if (
    assessment.confirmed_hard_blockers.length &&
    assessment.recommendation !== "reject"
  )
    throw new Error("A confirmed hard blocker cannot recommend interview.");
  if (
    !assessed &&
    assessment.recommendation === "reject" &&
    !assessment.confirmed_hard_blockers.length
  )
    throw new Error("Missing information alone cannot justify rejection.");
  return assessment;
}
