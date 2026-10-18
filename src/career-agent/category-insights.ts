import {
  ScreeningAssessment,
  ScreeningMetric,
  screeningMetrics,
} from "./job-screening";

export interface CategoryAssessment extends Record<string, unknown> {
  shortUUID: string;
  title: string;
  company: string;
  assessedAt: string;
  assessment: ScreeningAssessment;
}
type MetricAssessment = ScreeningAssessment["metric_assessments"][number];
export interface FindingSource {
  shortUUID: string;
  title: string;
  company: string;
  assessedAt: string;
  status?: MetricAssessment["status"];
  confidence?: MetricAssessment["confidence"];
  score?: number | null;
  reason?: string;
  evidence?: MetricAssessment["supporting_evidence"];
}
export interface Finding {
  text: string;
  jobs: number;
  sources: FindingSource[];
}
export interface CategoryInsightsResult {
  jobs: number;
  asOf: string | null;
  overall: number | null;
  evidenceCoverage: number | null;
  metrics: {
    metric: ScreeningMetric;
    average: number | null;
    assessed: number;
    unknown: number;
    notApplicable: number;
    jobsWithQuestions: number;
    findings: { total: number; items: Finding[] };
  }[];
  gaps: { total: number; items: Finding[] };
  questions: { total: number; items: Finding[] };
  strengths: { total: number; items: Finding[] };
  blockers: { total: number; items: Finding[] };
  intake: { total: number; items: Finding[]; nextOffset: number | null };
  method: string;
}
const average = (values: (number | null)[]): number | null => {
  let sum = 0, count = 0;
  for (const value of values) {
    if (value === null) continue;
    sum += value; count++;
  }
  return count ? Math.round(sum / count) : null;
};

// Only identical wording (ignoring whitespace/case) is grouped. No inferred
// capability gaps, semantic claims or new model calls are introduced here.
function findings(
  entries: { text: string; source: FindingSource }[],
  limit = 12,
  offset = 0,
): {
  total: number;
  items: Finding[];
} {
  const grouped = new Map<
    string,
    { text: string; sources: Map<string, FindingSource> }
  >();
  for (const entry of entries) {
    const key = entry.text.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) continue;
    let group = grouped.get(key);
    if (!group) {
      group = { text: entry.text, sources: new Map() };
      grouped.set(key, group);
    }
    group.sources.set(entry.source.shortUUID, entry.source);
  }
  const sorted = [...grouped.values()].sort(
    (a, b) => b.sources.size - a.sources.size || a.text.localeCompare(b.text),
  );
  return {
    total: sorted.length,
    items: sorted.slice(offset, offset + limit).map(group => ({
      text: group.text,
      jobs: group.sources.size,
      sources: [...group.sources.values()].slice(0, 3),
    })),
  };
}
export function categoryInsights(
  rows: CategoryAssessment[],
  questionOffset = 0,
  questionLimit = 200,
): CategoryInsightsResult {
  const source = (row: CategoryAssessment): FindingSource => ({
    shortUUID: row.shortUUID,
    title: row.title,
    company: row.company,
    assessedAt: row.assessedAt,
  });
  const section = (
    field:
      | "critical_gaps"
      | "priority_validation_questions"
      | "key_strengths"
      | "confirmed_hard_blockers",
  ): ReturnType<typeof findings> =>
    findings(
      rows.flatMap(row =>
        row.assessment[field].map(text => ({ text, source: source(row) })),
      ),
    );
  const metrics = screeningMetrics.map((metric: ScreeningMetric) => {
    const assessed: number[] = [];
    let unknown = 0,
      notApplicable = 0,
      jobsWithQuestions = 0;
    const entries: { text: string; source: FindingSource }[] = [];
    for (const row of rows) {
      const detail = row.assessment.metric_assessments.find(
        item => item.metric === metric,
      )!;
      if (detail.status === "assessed") assessed.push(row.assessment[metric]);
      else if (detail.status === "unknown") unknown++;
      else notApplicable++;
      if (detail.status === "not_applicable") continue;
      if (detail.gaps_or_questions.length) jobsWithQuestions++;
      // Keep unknown reasoning visible even when the model left the questions array empty.
      const questions = detail.gaps_or_questions.length
        ? detail.gaps_or_questions
        : detail.status === "unknown"
          ? [detail.reason]
          : [];
      for (const text of questions)
        entries.push({
          text,
          source: {
            ...source(row),
            status: detail.status,
            confidence: detail.confidence,
            score: detail.status === "assessed" ? row.assessment[metric] : null,
            reason: detail.reason,
            evidence: detail.supporting_evidence,
          },
        });
    }
    return {
      metric,
      average: average(assessed),
      assessed: assessed.length,
      unknown,
      notApplicable,
      jobsWithQuestions,
      findings: findings(entries),
    };
  });
  const intake = findings(
    rows.flatMap(row =>
      [
        ...row.assessment.priority_validation_questions,
        ...row.assessment.metric_assessments
          .filter(metric => metric.status !== "not_applicable")
          .flatMap(metric =>
            metric.gaps_or_questions.length
              ? metric.gaps_or_questions
              : metric.status === "unknown"
                ? [metric.reason]
                : [],
          ),
      ].map(text => ({ text, source: source(row) })),
    ),
    questionLimit,
    questionOffset,
  );
  return {
    intake: {
      ...intake,
      nextOffset:
        questionOffset + intake.items.length < intake.total
          ? questionOffset + intake.items.length
          : null,
    },
    jobs: rows.length,
    asOf:
      rows
        .map(row => row.assessedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    overall: average(rows.map(row => row.assessment.evidence_coverage > 0 ? row.assessment.overall_score : null)),
    evidenceCoverage: average(
      rows.map(row => row.assessment.evidence_coverage),
    ),
    metrics,
    gaps: section("critical_gaps"),
    questions: section("priority_validation_questions"),
    strengths: section("key_strengths"),
    blockers: section("confirmed_hard_blockers"),
    method:
      "All visible saved assessments in this category contribute to counts and averages. Unknown and not-applicable scores are excluded. Exact repeated wording is grouped; distinct wording is not treated as the same requirement. Each list shows up to 12 findings and three source examples per finding. Screening claims are suggestions for review, not independently verified facts or proof of inability.",
  };
}

// Keep MCP replies below fx's transport limit. Full source assessments remain in
// the owner-only insight view; conversation pages carry exact text and source IDs.
type ConversationFinding = { text: string; jobs: number; sourceJobs: string[] };
type ConversationCategory = Pick<
  CategoryInsightsResult,
  "jobs" | "asOf" | "overall" | "evidenceCoverage"
> & {
  documentId?: string;
  runId?: string;
  classification?: string;
  metrics: Omit<CategoryInsightsResult["metrics"][number], "findings">[];
  strengths: ConversationFinding[];
  gaps: ConversationFinding[];
  blockers: ConversationFinding[];
  intake: {
    total: number;
    items: ConversationFinding[];
    nextOffset: number | null;
  };
};
export function categoryConversationData(
  data: CategoryInsightsResult & {
    documentId?: string;
    runId?: string;
    classification?: string;
  },
  offset = 0,
): ConversationCategory {
  const compact = (finding: Finding): ConversationFinding => ({
    text: finding.text,
    jobs: finding.jobs,
    sourceJobs: finding.sources.map(source => source.shortUUID),
  });
  const result = {
    documentId: data.documentId,
    runId: data.runId,
    classification: data.classification,
    jobs: data.jobs,
    asOf: data.asOf,
    overall: data.overall,
    evidenceCoverage: data.evidenceCoverage,
    metrics: data.metrics.map(
      ({
        metric,
        average,
        assessed,
        unknown,
        notApplicable,
        jobsWithQuestions,
      }) => ({
        metric,
        average,
        assessed,
        unknown,
        notApplicable,
        jobsWithQuestions,
      }),
    ),
    strengths: data.strengths.items.slice(0, 3).map(compact),
    gaps: data.gaps.items.slice(0, 3).map(compact),
    blockers: data.blockers.items.slice(0, 3).map(compact),
    intake: { ...data.intake, items: data.intake.items.map(compact) },
  };
  while (
    Buffer.byteLength(JSON.stringify(result)) > 48000 &&
    result.intake.items.length > 1
  )
    result.intake.items.pop();
  result.intake.nextOffset =
    offset + result.intake.items.length < result.intake.total
      ? offset + result.intake.items.length
      : null;
  return result;
}
