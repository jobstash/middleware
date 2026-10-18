import * as Ajv from "ajv";
import { screeningEligibilityFixture, screeningFitClaimsFixture } from "./screening.fixture";
import {
  parseScreeningAssessment,
  screeningAssessmentSchemaForSources,
  screeningMetrics,
  ScreeningAssessment,
} from "./job-screening";
export const screeningFixture = (): ScreeningAssessment =>
  ({
    ...screeningEligibilityFixture("Build APIs."),
    ...screeningFitClaimsFixture("Built an API.", "Build APIs."),
    ...Object.fromEntries(screeningMetrics.map(m => [m, 0])),
    technical_fit: 80,
    fitness_for_role: 75,
    overall_score: 1,
    evidence_coverage: 1,
    recommendation: "interview",
    recommendation_reason:
      "Credible transferable foundations; validate responsibility scope.",
    metric_assessments: screeningMetrics.map(metric => ({
      metric,
      status: ["technical_fit", "fitness_for_role"].includes(metric)
        ? "assessed"
        : "unknown",
      confidence: "medium",
      reason:
        "Assess documented responsibilities; missing details remain unknown.",
      supporting_evidence: ["technical_fit", "fitness_for_role"].includes(
        metric,
      )
        ? [
            { source: "candidate_cv", excerpt: "Built an API." },
            { source: "job_description", excerpt: "Build APIs." },
          ]
        : [],
      gaps_or_questions: [],
    })),
    seniority_comparison: {
      required_responsibility_scope: "Delivery with support",
      demonstrated_candidate_scope: "An implemented project",
      material_difference: "Production scope is not documented",
    },
    confirmed_hard_blockers: [],
    key_strengths: ["Relevant project"],
    critical_gaps: [],
    priority_validation_questions: ["What did you personally implement?"],
  }) as ScreeningAssessment;
const sources = {
  candidate_cv: "Built an API.",
  job_description: "Build APIs.",
  additional_context: "",
};
describe("Evidence-based job screening rubric", () => {
  it("rejects removed work-mode scores instead of persisting an obsolete dimension", () => {
    expect(() =>
      parseScreeningAssessment(
        JSON.stringify({ ...screeningFixture(), work_mode_fit: 80 }),
        sources,
      ),
    ).toThrow();
  });
  it("recovers literal source spans across PDF line wraps without accepting paraphrases", () => {
    const input = { ...sources, candidate_cv: "Built  an\nAPI." };
    const a = screeningFixture();
    a.requirements[0].state = "supported";
    a.requirements[0].candidate_evidence = [{ source: "candidate_cv", excerpt: "Built an API." }];
    const result = parseScreeningAssessment(JSON.stringify(a), input);
    expect(result.requirements[0].candidate_evidence[0].excerpt).toBe(input.candidate_cv);
    expect(result.metric_assessments.find(metric => metric.metric === "technical_fit")!.supporting_evidence[0].excerpt).toBe(input.candidate_cv);
    a.requirements[0].candidate_evidence[0].excerpt = "Built a secure API.";
    expect(() => parseScreeningAssessment(JSON.stringify(a), input)).toThrow("not exact");
  });
  it("renormalizes only assessed dimensions and computes coverage separately", () => {
    const r = parseScreeningAssessment(
      JSON.stringify(screeningFixture()),
      sources,
    );
    expect(r.overall_score).toBe(78);
    expect(r.evidence_coverage).toBe(50);
    expect(r.location_fit).toBe(0);
  });
  it("does not turn a sparse junior CV into rejection", () => {
    const a = screeningFixture();
    for (const m of a.metric_assessments) {
      m.status = "unknown";
      m.supporting_evidence = [];
      a[m.metric] = 0;
    }
    a.overall_score = null;
    const r = parseScreeningAssessment(JSON.stringify(a), sources);
    expect(r.overall_score).toBeNull();
    expect(r.evidence_coverage).toBe(0);
    expect(r.recommendation).toBe("interview");
  });
  it("excludes non-applicable dimensions from the coverage denominator", () => {
    const a = screeningFixture();
    a.metric_assessments.find(m => m.metric === "culture_fit_company_size")!.status =
      "not_applicable";
    const roleContext = "Company-size experience is not relevant to this independent assignment.";
    a.metric_assessments.find(m => m.metric === "culture_fit_company_size")!.supporting_evidence = [{ source: "job_description", excerpt: roleContext }];
    expect(
      parseScreeningAssessment(JSON.stringify(a), { ...sources, job_description: `${sources.job_description} ${roleContext}` }).evidence_coverage,
    ).toBe(53);
  });
  it("rejects invented excerpts, duplicate dimensions and nonzero unknown placeholders", () => {
    let a = screeningFixture();
    a.metric_assessments[1].supporting_evidence[0].excerpt =
      "Managed 50 people";
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow(
      "excerpt",
    );
    a = screeningFixture();
    a.metric_assessments[0].metric = "technical_fit";
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow(
      "exactly once",
    );
    a = screeningFixture();
    a.location_fit = 50;
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow(
      "must use 0",
    );
  });
  it("cannot erase a confirmed hard blocker with growth potential", () => {
    const a = screeningFixture();
    a.confirmed_hard_blockers = ["Explicit incompatible office requirement"];
    a.claim_citations.push({ path: "/confirmed_hard_blockers/0", citations: [
      { source: "candidate_cv", excerpt: "Built an API." }, { source: "job_description", excerpt: "Build APIs." },
    ] });
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow(
      "hard blocker",
    );
  });
  it("keeps Amsterdam-to-SF relocation unresolved without treating citizenship as residence or refusal", () => {
    const a = screeningFixture();
    const eligibility = a.practical_eligibility;
    eligibility.candidate.current_location = "Amsterdam";
    eligibility.candidate.work_authorization = "US and EU citizenship";
    eligibility.candidate.evidence = [{ source: "candidate_cv", excerpt: "Amsterdam. US and EU citizenship." }];
    eligibility.job.workplace_type = "hybrid";
    eligibility.job.workplace_locations = ["San Francisco"];
    eligibility.job.onsite_attendance = "Three office days weekly";
    eligibility.job.evidence = [{ source: "job_description", excerpt: "San Francisco office three days weekly." }];
    eligibility.relocation_required = true;
    const supplied = { ...sources, candidate_cv: `${sources.candidate_cv} Amsterdam. US and EU citizenship.`,
      job_description: `${sources.job_description} San Francisco office three days weekly.`,
      additional_context: JSON.stringify({ candidate_preferences: { candidate_source_location: { currentLocation: "Amsterdam", relocation: null } } }) };
    const result = parseScreeningAssessment(JSON.stringify(a), supplied);
    expect(result.practical_eligibility).toMatchObject({ status: "unresolved", relocation_required: true, candidate: { current_location: "Amsterdam", relocation: "unknown" } });
    expect(result.recommendation).toBe("interview");
    expect(result.confirmed_hard_blockers).toEqual([]);
    eligibility.status = "eligible";
    eligibility.checks.forEach(check => { check.status = "eligible"; });
    expect(() => parseScreeningAssessment(JSON.stringify(a), supplied)).toThrow("without explicit candidate consent");
    eligibility.candidate.relocation = "open_anywhere";
    expect(() => parseScreeningAssessment(JSON.stringify(a), supplied)).toThrow("explicit relocation consent unchanged");
  });

  it("allows evidenced worldwide remote work despite an overseas headquarters", () => {
    const a = screeningFixture();
    Object.assign(a, screeningEligibilityFixture("Build APIs.", true));
    a.practical_eligibility.candidate.current_location = "Amsterdam";
    const result = parseScreeningAssessment(JSON.stringify(a), {
      ...sources, candidate_cv: `${sources.candidate_cv} Amsterdam.`,
      job_description: `${sources.job_description} Remote worldwide. Headquarters: San Francisco.`,
      additional_context: JSON.stringify({ candidate_preferences: { candidate_source_location: { currentLocation: "Amsterdam", relocation: null } } }),
    });
    expect(result.practical_eligibility).toMatchObject({ status: "eligible", relocation_required: false, candidate: { relocation: "unknown" }, job: { workplace_type: "remote", workplace_locations: [], remote_regions: ["Worldwide"] } });
  });

  it("retains a residency restriction even when a role is remote and the candidate has citizenship", () => {
    const a = screeningFixture();
    Object.assign(a, screeningEligibilityFixture("Build APIs.", true));
    a.practical_eligibility.job.residency_requirements = ["United States"];
    a.practical_eligibility.job.evidence.push({ source: "job_description", excerpt: "US residents only." });
    a.practical_eligibility.checks.find(check => check.constraint === "residency")!.status = "unresolved";
    const supplied = { ...sources, candidate_cv: `${sources.candidate_cv} US citizen living in Amsterdam.`,
      job_description: `${sources.job_description} Remote worldwide. US residents only.` };
    expect(() => parseScreeningAssessment(JSON.stringify(a), supplied)).toThrow("retain every unresolved");
    a.practical_eligibility.status = "unresolved";
    expect(parseScreeningAssessment(JSON.stringify(a), supplied).practical_eligibility.status).toBe("unresolved");
  });

  it("does not use employer context as candidate capability evidence", () => {
    const a = screeningFixture();
    a.requirements[0].state = "supported";
    a.requirements[0].candidate_evidence = [{ source: "additional_context", excerpt: "Uses Rust in production." }];
    expect(() => parseScreeningAssessment(JSON.stringify(a), {
      ...sources, additional_context: JSON.stringify({ candidate_preferences: {}, company: { description: "Uses Rust in production." } }),
    })).toThrow("not employer data");
  });

  it("accepts committed workplace metadata without inventing headquarters evidence", () => {
    const a = screeningFixture();
    Object.assign(a, screeningEligibilityFixture("Build APIs.", true));
    a.practical_eligibility.job.evidence = [{ source: "additional_context", excerpt: '"scope":"worldwide"' }];
    const supplied = { ...sources, additional_context: JSON.stringify({
      candidate_preferences: {}, job_geography: { fullyRemote: true, options: [{ scope: "worldwide" }] },
      company: { headquarters: "Elsewhere" },
    }) };
    expect(parseScreeningAssessment(JSON.stringify(a), supplied).practical_eligibility.status).toBe("eligible");
    a.practical_eligibility.job.evidence = [{ source: "additional_context", excerpt: "Elsewhere" }];
    expect(() => parseScreeningAssessment(JSON.stringify(a), supplied)).toThrow("not company headquarters");
  });

  it("preserves must-have versus preferred requirements and distinguishes team leadership from hands-on evidence", () => {
    const a = screeningFixture();
    a.requirements = [
      { requirement: "Implement APIs personally", kind: "responsibility", priority: "must_have", state: "partial", candidate_scope: "team_lead",
        job_evidence: [{ source: "job_description", excerpt: "Hands-on API implementation required." }],
        candidate_evidence: [{ source: "candidate_cv", excerpt: "Led the team implementing APIs." }] },
      { requirement: "Rust", kind: "skill", priority: "nice_to_have", state: "unknown", candidate_scope: "unknown",
        job_evidence: [{ source: "job_description", excerpt: "Rust preferred." }], candidate_evidence: [] },
    ];
    const supplied = { ...sources, candidate_cv: `${sources.candidate_cv} Led the team implementing APIs.`,
      job_description: `${sources.job_description} Hands-on API implementation required. Rust preferred.` };
    const result = parseScreeningAssessment(JSON.stringify(a), supplied);
    expect(result.requirements).toMatchObject([{ priority: "must_have", state: "partial", candidate_scope: "team_lead" }, { priority: "nice_to_have", state: "unknown" }]);
    a.requirements[1].state = "gap";
    expect(() => parseScreeningAssessment(JSON.stringify(a), supplied)).toThrow("missing information is unknown");
    a.requirements[1].state = "unknown";
    a.requirements[0].job_evidence[0].excerpt = "Invented day-one mandate";
    expect(() => parseScreeningAssessment(JSON.stringify(a), supplied)).toThrow("not exact");
  });

  it("withholds a 95 aggregate with unknown company context without deflating evidenced components", () => {
    const a = screeningFixture();
    for (const metric of a.metric_assessments) {
      const companyUnknown = metric.metric === "culture_fit_company_size" || metric.metric === "culture_fit_company_phase";
      a[metric.metric] = companyUnknown ? 0 : 95;
      metric.status = companyUnknown ? "unknown" : "assessed";
      metric.confidence = "high";
      metric.supporting_evidence = companyUnknown ? [] : [{ source: "candidate_cv", excerpt: "Built an API." }, { source: "job_description", excerpt: "Build APIs." }];
    }
    a.overall_score = 95;
    a.unknowns = ["Company size and operating phase are not documented."];
    a.recommendation_reason = "Invite further evaluation; aggregate withheld until company context is established.";
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("every applicable dimension");
    a.overall_score = null;
    const result = parseScreeningAssessment(JSON.stringify(a), sources);
    expect(result.overall_score).toBeNull();
    expect(result.evidence_coverage).toBe(89);
    expect(result.technical_fit).toBe(95);
    expect(result.factual_seniority_fit).toBe(95);
    expect(result.fitness_for_role).toBe(95);
    expect(result.metric_assessments).toEqual(a.metric_assessments);
    a.unknowns = [];
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("explicit unknowns");
  });

  it("allows fully evidenced 90+ without a quota or distribution penalty", () => {
    const a = screeningFixture();
    for (const metric of a.metric_assessments) {
      a[metric.metric] = 95;
      metric.status = "assessed";
      metric.confidence = "high";
      metric.supporting_evidence = [{ source: "candidate_cv", excerpt: "Built an API." }, { source: "job_description", excerpt: "Build APIs." }];
    }
    const result = parseScreeningAssessment(JSON.stringify(a), sources);
    expect(result.overall_score).toBe(95);
    expect(result.evidence_coverage).toBe(100);
    a.metric_assessments[0].confidence = "low";
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("high-confidence");
    a.overall_score = null;
    const deferred = parseScreeningAssessment(JSON.stringify(a), sources);
    expect(deferred.overall_score).toBeNull();
    expect(deferred.location_fit).toBe(95);
    expect(deferred.evidence_coverage).toBe(100);
  });

  it("rejects candidate claims that cite employer facts, absent claim links and stale claim pointers", () => {
    const a = screeningFixture();
    a.claim_citations.find(link => link.path === "/key_strengths/0")!.citations = [{ source: "job_description", excerpt: "Build APIs." }];
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("source lanes");
    a.claim_citations.pop();
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("linked citations");
    a.claim_citations.push({ path: "/key_strengths/99", citations: [{ source: "candidate_cv", excerpt: "Built an API." }] });
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("populated summary claims");
  });

  it("rejects PASS, hidden-text scoring, and relabeling unknown core dimensions as inapplicable", () => {
    expect(() => parseScreeningAssessment(JSON.stringify({ ...screeningFixture(), recommendation: "PASS" }), sources)).toThrow("incomplete assessment");
    const a = screeningFixture();
    a.metric_assessments[1].supporting_evidence[0] = { source: "hidden_context", excerpt: "Built an API." };
    expect(() => parseScreeningAssessment(JSON.stringify(a), { ...sources, hidden_context: "Built an API." })).toThrow();
    a.metric_assessments[0].status = "not_applicable";
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources)).toThrow("Core fit dimensions");
  });

  it("recomputes approved policy weights and disallows zero-weight evidence bypasses", () => {
    const a = screeningFixture();
    const weights = { location_fit: 10, technical_fit: 5, factual_seniority_fit: 20, culture_fit_company_size: 5, culture_fit_company_phase: 5, fitness_for_role: 40, potential_to_grow_into_role: 5 };
    const result = parseScreeningAssessment(JSON.stringify(a), sources, { policy: { version: "approved", weights } });
    expect(result.overall_score).toBe(76);
    weights.location_fit = 0;
    expect(() => parseScreeningAssessment(JSON.stringify(a), sources, { policy: { version: "invalid", weights } })).toThrow("positive finite weight");
  });

  it("binds the advertised schema to exact canonical location and relocation values without geographic embellishment", () => {
    const pinnedSources = {
      ...sources,
      additional_context: JSON.stringify({ candidate_preferences: { candidate_source_location: { currentLocation: "Amsterdam", relocation: null } } }),
    };
    const validatePinned = new Ajv().compile(screeningAssessmentSchemaForSources(pinnedSources));
    const a = screeningFixture();
    a.practical_eligibility.candidate.current_location = "Amsterdam";
    expect(validatePinned(a)).toBe(true);
    expect(parseScreeningAssessment(JSON.stringify(a), pinnedSources).practical_eligibility.candidate.current_location).toBe("Amsterdam");
    a.practical_eligibility.candidate.current_location = "Amsterdam, Netherlands";
    expect(validatePinned(a)).toBe(false);
    expect(() => parseScreeningAssessment(JSON.stringify(a), pinnedSources)).toThrow("unchanged");
    a.practical_eligibility.candidate.current_location = "Amsterdam";
    a.practical_eligibility.candidate.relocation = "open_anywhere";
    expect(validatePinned(a)).toBe(false);
  });

  it("retains explicit null bindings without mutating schemas for different or unpinned sources", () => {
    const nullSources = { ...sources, additional_context: JSON.stringify({ candidate_preferences: { candidate_source_location: { currentLocation: null, relocation: null } } }) };
    const nullSchema = new Ajv().compile(screeningAssessmentSchemaForSources(nullSources));
    const unpinnedSchema = new Ajv().compile(screeningAssessmentSchemaForSources(sources));
    const a = screeningFixture();
    expect(nullSchema(a)).toBe(true);
    a.practical_eligibility.candidate.current_location = "Amsterdam";
    expect(nullSchema(a)).toBe(false);
    expect(unpinnedSchema(a)).toBe(true);
  });
});
