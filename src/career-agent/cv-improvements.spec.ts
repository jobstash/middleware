import { aggregateCvImprovements, ImprovementAssessment } from "./cv-improvements";
import { ScreeningAssessment, ScreeningRequirement } from "./job-screening";
import { screeningEligibilityFixture } from "./screening.fixture";

const requirement = (value: Partial<ScreeningRequirement> = {}): ScreeningRequirement => ({
  requirement: "Production system ownership", kind: "skill", priority: "must_have", state: "unknown",
  candidate_scope: "unknown", job_evidence: [{ source: "job_description", excerpt: "Own production systems" }],
  candidate_evidence: [], ...value,
});
function reviewed(shortUUID: string, requirements: ScreeningRequirement[]): ImprovementAssessment {
  const eligibility = screeningEligibilityFixture("Own production systems", true);
  return {
    shortUUID, title: `Role ${shortUUID}`, company: "Example", assessedAt: "2026-09-29T12:00:00Z",
    assessment: { ...eligibility, requirements } as ScreeningAssessment,
  };
}

describe("CV improvements from saved reviews", () => {
  it("consolidates differently worded technical requirements while retaining exact provenance and unique role counts", () => {
    const first = requirement();
    const second = requirement({ requirement: "Operating payment APIs", state: "partial", candidate_scope: "hands_on",
      candidate_evidence: [{ source: "candidate_cv", excerpt: "Implemented a payment API" }] });
    const result = aggregateCvImprovements([reviewed("one", [first, first]), reviewed("two", [second])]);
    expect(result).toEqual([expect.objectContaining({ id: "cv_detail:technical", action: "edit", jobs: 2,
      sources: [expect.objectContaining({ shortUUID: "one", requirement: first.requirement, evidence: first.job_evidence }),
        expect.objectContaining({ shortUUID: "two", requirement: second.requirement, evidence: [...second.job_evidence, ...second.candidate_evidence] })] })]);
  });

  it("keeps missing evidence separate from source-backed assessed differences and does not assert unsupported gaps", () => {
    const unsupported = requirement({ state: "gap" });
    const difference = requirement({ state: "gap", requirement: "Direct team management",
      kind: "responsibility", candidate_scope: "team_lead", candidate_evidence: [{ source: "candidate_cv", excerpt: "Individual contributor; no direct reports" }] });
    const result = aggregateCvImprovements([reviewed("one", [unsupported, difference])]);
    expect(result.find(item => item.kind === "cv_detail")).toMatchObject({ action: "add", sources: [{ state: "unknown" }] });
    expect(result.find(item => item.kind === "assessed_gap")).toMatchObject({ id: "assessed_gap:leadership", action: "discuss", sources: [{ state: "gap", requirement: "Direct team management" }] });
  });

  it("does not turn supported skills, uncited requirements or location questions into CV deficiencies", () => {
    const row = reviewed("one", [requirement({ state: "supported" }), requirement({ job_evidence: [] }), requirement({ kind: "location" })]);
    expect(aggregateCvImprovements([row])).toEqual([]);
  });

  it("separates employer unknowns from candidate facts and only asks about unresolved employer constraints", () => {
    const row = reviewed("one", []);
    row.assessment.practical_eligibility.job.sponsorship = "unknown";
    row.assessment.practical_eligibility.job.work_authorization = "EU work authorization";
    row.assessment.practical_eligibility.checks = [
      { constraint: "sponsorship", status: "unresolved", reason: "Does this employer sponsor visas?", evidence: [] },
      { constraint: "work_authorization", status: "unresolved", reason: "Candidate authorization is unknown", evidence: [] },
    ];
    expect(aggregateCvImprovements([row])).toEqual([expect.objectContaining({
      id: "employer_unknown:sponsorship", kind: "employer_unknown", action: "ask_employer",
      sources: [expect.objectContaining({ requirement: "Does this employer sponsor visas?" })],
    })]);
  });

  it("returns no inferred work for an empty current dataset", () => {
    expect(aggregateCvImprovements([])).toEqual([]);
  });
});
