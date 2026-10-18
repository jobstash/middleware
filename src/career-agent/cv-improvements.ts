import type { ScreeningAssessment, ScreeningEvidence, ScreeningRequirement } from "./job-screening";

export interface ImprovementAssessment {
  shortUUID: string;
  title: string;
  company: string | null;
  assessedAt: string;
  assessment: ScreeningAssessment;
}
type FindingKind = "cv_detail" | "assessed_gap" | "employer_unknown";
interface ImprovementSource {
  shortUUID: string;
  title: string;
  company: string | null;
  assessedAt: string;
  requirement: string;
  state: string;
  priority: string | null;
  evidence: ScreeningEvidence[];
}
export interface CvImprovement {
  id: string;
  kind: FindingKind;
  title: string;
  action: "add" | "edit" | "discuss" | "ask_employer";
  sources: ImprovementSource[];
  jobs: number;
}

// Group by the rubric's structured responsibility dimensions, never by guessed
// semantic similarity. Distinct advertised requirements remain attributed below
// each theme; grouping does not claim that those requirements are equivalent.
function theme(requirement: ScreeningRequirement) {
  if (requirement.kind === "skill") return { id: "technical", title: "Technical experience" };
  if (requirement.candidate_scope === "team_lead" || requirement.candidate_scope === "both")
    return { id: "leadership", title: "Leadership and ownership" };
  return requirement.kind === "responsibility"
    ? { id: "responsibilities", title: "Responsibilities and results" }
    : { id: "experience", title: "Relevant experience" };
}
const employerMissing = (assessment: ScreeningAssessment, constraint: string): boolean => {
  const job = assessment.practical_eligibility.job;
  switch (constraint) {
    case "workplace": return job.workplace_type === "unknown";
    case "remote_region": return job.workplace_type === "remote" && !job.remote_regions.length;
    case "onsite_attendance": return job.workplace_type !== "remote" && !job.onsite_attendance;
    case "work_authorization": return !job.work_authorization;
    case "sponsorship": return job.sponsorship === "unknown";
    default: return false;
  }
};
const employerTitles: Record<string, string> = {
  workplace: "Ask about the workplace", remote_region: "Ask where remote work is permitted",
  onsite_attendance: "Ask about office attendance", work_authorization: "Ask about work authorization",
  sponsorship: "Ask about sponsorship",
};

/** Pure projection of current, eligible, source-verified saved assessments. */
export function aggregateCvImprovements(rows: ImprovementAssessment[]): CvImprovement[] {
  const groups = new Map<string, CvImprovement>();
  const seen = new Set<string>();
  const add = (id: string, kind: FindingKind, title: string, action: CvImprovement["action"], source: ImprovementSource) => {
    const key = `${id}:${source.shortUUID}:${source.requirement.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const group = groups.get(id) ?? { id, kind, title, action, sources: [], jobs: 0 };
    if (action === "edit" && group.action === "add") group.action = "edit";
    group.sources.push(source);
    groups.set(id, group);
  };
  for (const row of rows) {
    const source = (requirement: string, state: string, evidence: ScreeningEvidence[], priority: string | null = null): ImprovementSource => ({
      shortUUID: row.shortUUID, title: row.title, company: row.company, assessedAt: row.assessedAt,
      requirement, state, priority, evidence,
    });
    for (const requirement of row.assessment.requirements) {
      if (!["skill", "experience", "responsibility"].includes(requirement.kind) || requirement.state === "supported") continue;
      const jobEvidence = requirement.job_evidence.filter(item => item.source === "job_description");
      if (!jobEvidence.length) continue;
      const candidateEvidence = requirement.candidate_evidence.filter(item => item.source === "candidate_cv" || item.source === "additional_context");
      // A saved gap is a source-backed assessment, not proof of inability. An
      // unsupported gap cannot become an asserted skill deficit in this view.
      const gap = requirement.state === "gap" && candidateEvidence.length > 0;
      const kind = gap ? "assessed_gap" : "cv_detail";
      const group = theme(requirement);
      add(`${kind}:${group.id}`, kind, group.title, gap ? "discuss" : candidateEvidence.length ? "edit" : "add",
        source(requirement.requirement, gap ? "gap" : requirement.state === "gap" ? "unknown" : requirement.state,
          [...jobEvidence, ...candidateEvidence], requirement.priority));
    }
    for (const check of row.assessment.practical_eligibility.checks) {
      if (check.status !== "unresolved" || !employerMissing(row.assessment, check.constraint)) continue;
      add(`employer_unknown:${check.constraint}`, "employer_unknown", employerTitles[check.constraint], "ask_employer",
        source(check.reason, check.status, check.evidence));
    }
  }
  for (const group of groups.values()) group.jobs = new Set(group.sources.map(source => source.shortUUID)).size;
  return [...groups.values()].sort((a, b) => b.jobs - a.jobs || a.id.localeCompare(b.id));
}
