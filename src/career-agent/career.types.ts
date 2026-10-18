export interface CareerEvidence {
  id: string;
  statement: string;
  kind?:
    | "role"
    | "responsibility"
    | "technology"
    | "scope"
    | "outcome"
    | "qualification";
  declaredConflicts?: string[];
  attribute?: "education_level";
  employer?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  source: {
    kind:
      | "existing_profile"
      | "candidate"
      | "document"
      | "inference"
      | "answer"
      | "application";
    applicationDocumentId?: string;
    applicationRevision?: number;
    answerId?: string;
    answerRevision?: number;
    /** Set only by server extraction/citation writers, never accepted from a DTO. */
    authority?: "extraction" | "citation";
    contentHash?: string;
    extractionMode?: "text" | "image";
    extractionRequestId?: string;
    candidateAuthored?: boolean;
    sourceEvidenceId?: string;
    documentId?: string;
    messageId?: string;
    workflow?: { objectKind: string; objectId: string; classification: string };
    excerpt: string | null;
  };
  excluded: boolean;
  conflicts: string[];
  /** Derived against current owned sources; never a human attestation. */
  usable?: boolean;
}
export interface CareerState {
  revision: number;
  evidence: CareerEvidence[];
}
export interface StackDefinition {
  filters?: import("./stack-filters").StackFilters;
  id: string;
  revision: number;
  name: string;
  intent: string;
  pinned: boolean;
  classifications: string[];
  workModes?: ("remote" | "hybrid" | "onsite")[];
  keywords?: { all?: string[]; any?: string[]; exclude?: string[] };
  allowedJobs?: string[];
}
export interface ApplicationState {
  companyBlocked?: boolean;
  saved: boolean;
  interested: boolean;
  passed: boolean;
  status: string | null;
}
export interface ApplicationMutationResult {
  action: string;
  id: string;
  shortUUID: string;
  revision: number;
  state: ApplicationState;
  before: ApplicationState;
  requestId: string;
}
export const EMPTY_APPLICATION: ApplicationState = {
  saved: false,
  interested: false,
  passed: false,
  status: null,
};
