import { randomUUID } from "node:crypto";
import { RecommendationCareerInput } from "src/auth/profile/dto/recommendation-career.input";
import { CareerEvidence } from "./career.types";

/** A later upload enriches the profile; absence is never evidence of removal. */
export function mergeCareer(
  previous: Partial<RecommendationCareerInput>,
  incoming: RecommendationCareerInput,
): Pick<RecommendationCareerInput, "roles" | "educationLevel"> {
  const roles = [...(previous.roles ?? [])];
  const identity = (role: RecommendationCareerInput["roles"][number]): string =>
    JSON.stringify([
      role.title,
      role.company,
      role.description,
      role.startDate,
      role.endDate,
      role.current,
      role.seniority,
    ]);
  for (const role of incoming.roles) {
    if (!roles.some(existing => identity(existing) === identity(role)))
      roles.push(role);
  }
  return {
    roles,
    educationLevel: previous.educationLevel ?? incoming.educationLevel ?? null,
  };
}

export function addCareerEvidence(
  evidence: CareerEvidence[],
  career: ReturnType<typeof mergeCareer>,
  kind: "existing_profile" | "candidate",
): CareerEvidence[] {
  const merged = [...evidence];
  for (const role of career.roles) {
    const statement =
      role.description?.trim() ||
      [role.title, role.company].filter(Boolean).join(" · ");
    if (
      !statement ||
      merged.some(
        e =>
          e.statement === statement &&
          e.employer === role.company &&
          e.role === role.title &&
          (e.startDate ?? null) === role.startDate &&
          (e.endDate ?? null) === role.endDate,
      )
    )
      continue;
    merged.push({
      id: randomUUID(),
      statement,
      employer: role.company,
      role: role.title,
      startDate: role.startDate ?? undefined,
      endDate: role.endDate ?? undefined,
      source: { kind, excerpt: null, ...(kind === "candidate" ? { candidateAuthored: true } : {}) },
      excluded: false,
      conflicts: [],
    });
  }
  if (career.educationLevel) {
    const statement = `Education level: ${career.educationLevel}`;
    if (
      !merged.some(
        e => e.attribute === "education_level" && e.statement === statement,
      )
    )
      merged.push({
        id: randomUUID(),
        kind: "qualification",
        attribute: "education_level",
        statement,
        source: { kind, excerpt: null, ...(kind === "candidate" ? { candidateAuthored: true } : {}) },
        excluded: false,
        conflicts: [],
      });
  }
  return findEvidenceConflicts(merged);
}

export function findEvidenceConflicts(
  evidence: CareerEvidence[],
): CareerEvidence[] {
  const key = (s?: string): string | undefined => s?.trim().toLowerCase();
  return evidence.map(claim => ({
    ...claim,
    conflicts:
      claim.excluded
        ? []
        : evidence
            .filter(
              other =>
                other.id !== claim.id &&
                !other.excluded &&
                ((claim.declaredConflicts ?? []).includes(other.id) ||
                  (other.declaredConflicts ?? []).includes(claim.id) ||
                  (claim.attribute === "education_level" &&
                    other.attribute === claim.attribute &&
                    claim.statement !== other.statement) ||
                  (!!claim.employer &&
                    !!claim.role &&
                    key(other.employer) === key(claim.employer) &&
                    key(other.role) === key(claim.role) &&
                    ((other.startDate &&
                      claim.startDate &&
                      other.startDate !== claim.startDate) ||
                      (other.endDate &&
                        claim.endDate &&
                        other.endDate !== claim.endDate)))),
            )
            .map(other => other.id),
  }));
}

export function mergeDocumentEvidence(
  previous: CareerEvidence[],
  claims: unknown[],
  documentId: string,
  sourceText: string,
  extraction?: { contentHash: string; requestId: string; mode: "text" | "image" },
): CareerEvidence[] {
  const result = [...previous];
  for (const item of claims.slice(0, 150)) {
    if (!item || typeof item !== "object") continue;
    const claim = item as Record<string, unknown>;
    if (
      typeof claim.statement !== "string" ||
      !claim.statement.trim() ||
      claim.statement.length > 4000
    )
      continue;
    if (
      result.some(
        e =>
          e.statement === claim.statement &&
          e.employer === claim.employer &&
          e.role === claim.role &&
          e.source.documentId === documentId,
      )
    )
      continue;
    const excerpt =
      typeof claim.excerpt === "string" &&
      claim.excerpt.length > 0 &&
      sourceText.includes(claim.excerpt)
        ? claim.excerpt
        : null;
    const date = (s: unknown): string | undefined =>
      typeof s === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      sourceText.includes(s)
        ? s
        : undefined;
    result.push({
      id: randomUUID(),
      statement: claim.statement.trim(),
      kind: claim.kind as CareerEvidence["kind"],
      employer: typeof claim.employer === "string" ? claim.employer : undefined,
      role: typeof claim.role === "string" ? claim.role : undefined,
      startDate: date(claim.startDate),
      endDate: date(claim.endDate),
      source: {
        kind: excerpt || extraction?.mode === "image" ? "document" : "inference",
        documentId, excerpt,
        ...(extraction ? {
          authority: "extraction" as const, contentHash: extraction.contentHash,
          extractionMode: extraction.mode, extractionRequestId: extraction.requestId,
        } : {}),
      },
      excluded: false,
      conflicts: [],
      declaredConflicts: Array.isArray(claim.conflictsWith)
        ? claim.conflictsWith.filter(
            (id): id is string =>
              typeof id === "string" && previous.some(e => e.id === id),
          )
        : [],
    });
  }
  return findEvidenceConflicts(result);
}
