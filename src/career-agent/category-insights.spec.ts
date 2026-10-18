import {
  categoryInsights,
  CategoryAssessment,
  categoryConversationData,
} from "./category-insights";
import { ScreeningAssessment, screeningMetrics } from "./job-screening";
const row = (
  id: string,
  status: "assessed" | "unknown" | "not_applicable" = "assessed",
): CategoryAssessment => ({
  shortUUID: id,
  title: "Backend Engineer",
  company: "Example",
  assessedAt: "2026-09-08T10:00:00Z",
  assessment: {
    ...Object.fromEntries(screeningMetrics.map(metric => [metric, 0])),
    technical_fit: status === "assessed" ? 80 : 0,
    overall_score: status === "assessed" ? 80 : 0,
    evidence_coverage: status === "assessed" ? 100 : 0,
    recommendation: "interview",
    recommendation_reason: "Validate production scope",
    metric_assessments: screeningMetrics.map(metric => ({
      metric,
      status: metric === "technical_fit" ? status : "not_applicable",
      confidence: "medium",
      reason: "Production scope is not documented.",
      supporting_evidence: [
        { source: "candidate_cv", excerpt: "Built an API." },
      ],
      gaps_or_questions:
        metric === "technical_fit" && status === "assessed"
          ? [
              "Describe your production API ownership.",
              "Describe your production API ownership.",
            ]
          : [],
    })),
    seniority_comparison: {
      required_responsibility_scope: "",
      demonstrated_candidate_scope: "",
      material_difference: "",
    },
    confirmed_hard_blockers: [],
    critical_gaps: [],
    key_strengths: ["Built an API."],
    priority_validation_questions: [],
  } as ScreeningAssessment,
});
describe("Career category insights", () => {
  it("excludes unknown/not-applicable zeros and preserves the distinction from capability gaps", () => {
    const result = categoryInsights([
      row("one"),
      row("two", "unknown"),
      row("three", "not_applicable"),
    ]);
    expect(result.overall).toBe(80);
    const technical = result.metrics.find(m => m.metric === "technical_fit")!;
    expect(technical).toMatchObject({
      average: 80,
      assessed: 1,
      unknown: 1,
      notApplicable: 1,
      jobsWithQuestions: 1,
    });
    expect(
      technical.findings.items.find(
        i => i.text === "Production scope is not documented.",
      )?.sources[0],
    ).toMatchObject({
      status: "unknown",
      score: null,
      evidence: [{ source: "candidate_cv", excerpt: "Built an API." }],
    });
  });
  it("keeps deferred high-evidence aggregates out of the category average instead of counting them as zero", () => {
    const deferred = row("deferred");
    deferred.assessment.overall_score = null;
    deferred.assessment.evidence_coverage = 89;
    expect(categoryInsights([row("scored"), deferred]).overall).toBe(80);
    expect(categoryInsights([deferred]).overall).toBeNull();
  });
  it("counts distinct jobs, keeps source attribution, and does not invent semantic recurrence", () => {
    const second = row("two");
    second.assessment.metric_assessments
      .find(m => m.metric === "technical_fit")!
      .gaps_or_questions.push("Which APIs did you operate?");
    const result = categoryInsights([row("one"), second]);
    const findings = result.metrics.find(
      m => m.metric === "technical_fit",
    )!.findings;
    expect(findings.total).toBe(2);
    expect(findings.items[0]).toMatchObject({
      jobs: 2,
      text: "Describe your production API ownership.",
    });
    expect(findings.items[0].sources.map(s => s.shortUUID)).toEqual([
      "one",
      "two",
    ]);
  });
  it("reports bounded examples honestly and handles an empty category", () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const r = row(String(i));
      r.assessment.critical_gaps = [`Gap ${i}`];
      return r;
    });
    const result = categoryInsights(rows);
    expect(result.gaps).toMatchObject({ total: 20 });
    expect(result.gaps.items).toHaveLength(12);
    expect(result.strengths.items[0]).toMatchObject({ jobs: 20 });
    expect(result.strengths.items[0].sources).toHaveLength(3);
    expect(categoryInsights([])).toMatchObject({
      jobs: 0,
      overall: null,
      evidenceCoverage: null,
      asOf: null,
    });
  });
  it("collects every distinct question for conversational intake with stable pagination", () => {
    const rows = Array.from({ length: 250 }, (_, i) => {
      const r = row(String(i));
      r.assessment.priority_validation_questions = [
        `Question ${String(i).padStart(3, "0")}?`,
      ];
      return r;
    });
    const first = categoryInsights(rows).intake;
    const second = categoryInsights(rows, first.nextOffset!).intake;
    expect(first.total).toBe(251);
    expect(first.items).toHaveLength(200);
    expect(second.items).toHaveLength(51);
    expect(second.nextOffset).toBeNull();
    const complete = categoryInsights(rows, 0, Number.MAX_SAFE_INTEGER).intake;
    expect(complete.items).toHaveLength(251);
    expect(complete.nextOffset).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map(q => q.text)).size,
    ).toBe(251);
    expect(first.items[0]).toMatchObject({
      jobs: 250,
      text: "Describe your production API ownership.",
    });
  });
  it("paginates large conversation results without dropping questions or exceeding the fx envelope", () => {
    const rows = Array.from({ length: 250 }, (_, i) => {
      const r = row(String(i));
      r.assessment.priority_validation_questions = [
        `Question ${i}: ${"long evidence ".repeat(100)}`,
      ];
      return r;
    });
    const seen = new Set<string>();
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const result = categoryConversationData(
        categoryInsights(rows, offset),
        offset,
      );
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(48000);
      result.intake.items.forEach(item => seen.add(item.text));
      if (result.intake.nextOffset === null) break;
      expect(result.intake.nextOffset).toBeGreaterThan(offset);
      offset = result.intake.nextOffset;
    }
    expect(seen.size).toBe(251);
  });
});
