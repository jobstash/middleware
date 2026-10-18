import { IsObject, IsString, MaxLength, MinLength } from "class-validator";
import { stackFiltersSchema, stackFacetColumns } from "./stack-filters";
import { profileUpdateSchema } from "./profile-tools";
import { screeningMetrics } from "./job-screening";
import { candidateMatchingRefreshSchema, candidateMatchingResultsSchema } from "./candidate-matching.dto";
import { screeningGovernanceSchemas } from "./screening-governance.dto";

export class CandidateInvokeInput {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsObject() arguments: Record<string, unknown>;
}
const baselineChangesSchema = {
  type: "array", maxItems: 2000,
  items: { type: "object", additionalProperties: false, required: ["entryId", "text"],
    properties: { entryId: { type: "string", minLength: 1, maxLength: 100 }, text: { type: "string", minLength: 1, maxLength: 20000 },
      evidenceIds: { type: "array", maxItems: 20, items: { type: "string", format: "uuid" } } } },
};
const baselineOrderSchema = { type: "array", maxItems: 2000, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 100 } };
const schemas = {
  cv_job_review_save: {
    type: "object",
    additionalProperties: false,
    required: [
      "requestId",
      "revision",
      "documentId",
      "shortUUID",
      "cvHash",
      "adHash",
      "summary",
      "requirements",
      "nextSteps",
    ],
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { type: "integer", minimum: 0 },
      documentId: { type: "string", format: "uuid" },
      shortUUID: { type: "string", minLength: 1, maxLength: 128 },
      cvHash: { type: "string", pattern: "^[a-f0-9]{32}$" },
      adHash: { type: "string", pattern: "^[a-f0-9]{32}$" },
      summary: { type: "string", maxLength: 3000 },
      requirements: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["requirement", "dimension", "state", "feedback"],
          properties: {
            requirement: { type: "string", minLength: 12, maxLength: 2000 },
            dimension: {
              enum: [
                "Technical skills",
                "Delivery",
                "Leadership",
                "Domain",
                "Experience",
                "Education",
                "Role scope",
              ],
            },
            state: { enum: ["supported", "partial", "gap", "unclear"] },
            cvExcerpt: { type: "string", maxLength: 4000 },
            feedback: { type: "string", maxLength: 2000 },
          },
        },
      },
      nextSteps: {
        type: "array",
        maxItems: 10,
        items: { type: "string", maxLength: 2000 },
      },
    },
  },
  application_start: {
    type: "object",
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { type: "integer", minimum: 0 },
      shortUUID: { type: "string", minLength: 1, maxLength: 128 },
    },
    required: ["requestId", "revision", "shortUUID"],
    additionalProperties: false,
  },
  source_document_read: {
    type: "object",
    properties: { documentId: { type: "string", format: "uuid" } },
    required: ["documentId"],
    additionalProperties: false,
  },
  vacancy_read: {
    type: "object",
    description: "Read the complete original advertisement for an eligible vacancy. Pass the selected owned sourceDocumentId for CV-based geographic eligibility. A worker's pinned source is authoritative and cannot be changed. Without either source, no CV location is inferred: jobs requiring that context remain unavailable.",
    properties: {
      shortUUID: { type: "string", minLength: 1, maxLength: 128 },
      sourceDocumentId: { type: "string", format: "uuid", description: "Selected owned CV source. Optional when the worker already pins this source or when the vacancy is eligible without selected-CV geographic context." },
    },
    required: ["shortUUID"],
    additionalProperties: false,
  },
  screening_category_read: {
    type: "object",
    properties: {
      questionOffset: { type: "integer", minimum: 0, maximum: 100000 },
      documentId: { type: "string", format: "uuid" },
      classification: { type: "string", minLength: 1, maxLength: 120 },
      runId: { type: "string", format: "uuid" },
    },
    required: ["documentId", "classification"],
    additionalProperties: false,
  },
  career_read: { type: "object", properties: {}, additionalProperties: false },
  cv_read: {
    type: "object",
    properties: { cvId: { type: "string", format: "uuid" } },
    required: ["cvId"],
    additionalProperties: false,
  },
  application_read: {
    type: "object",
    properties: { documentId: { type: "string", format: "uuid" } },
    required: ["documentId"],
    additionalProperties: false,
  },
  stack_create: {
    type: "object",
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { const: 0 },
      name: { type: "string", maxLength: 80 },
      filters: stackFiltersSchema,
      keywords: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          ["all", "any", "exclude"].map(key => [
            key,
            {
              type: "array",
              description:
                key === "all"
                  ? "AND: every term must occur. Empty unless all are required."
                  : key === "any"
                    ? "OR: at least one term must occur. Put BOTH alternatives here for A or B."
                    : "Exclude ads containing any of these terms.",
              maxItems: 12,
              items: { type: "string", minLength: 1, maxLength: 120 },
            },
          ]),
        ),
      },
      intent: {
        enum: ["best", "fresh", "direction", "adjacent", "network"],
        description:
          "Default best. Use fresh for newest first. Adjacent EXCLUDES the selected classifications; only use when explicitly seeking roles outside them. A named engineering search uses best with ENGINEERING, never adjacent.",
      },
      pinned: { type: "boolean" },
      workModes: {
        type: "array",
        maxItems: 3,
        items: { enum: ["remote", "hybrid", "onsite"] },
      },
      classifications: {
        type: "array",
        items: { type: "string" },
        maxItems: 10,
      },
    },
    required: [
      "requestId",
      "revision",
      "name",
      "intent",
      "pinned",
      "classifications",
    ],
    additionalProperties: false,
  },
  cv_guidance: {
    type: "object",
    properties: { direction: { type: "string", minLength: 1, maxLength: 160 } },
    required: ["direction"],
    additionalProperties: false,
  },
  cv_create: {
    type: "object",
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { const: 0 },
      name: { type: "string" },
      sourceDocumentId: { type: "string", format: "uuid" },
      baselineChanges: baselineChangesSchema,
      baselineOrder: baselineOrderSchema,
      direction: {
        type: "string",
        maxLength: 160,
        description:
          "Exact classification from career_read directions.available, e.g. ENGINEERING. Do not use natural-language labels such as remote engineering.",
      },
      heading: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 160 },
          contact: { type: "string", maxLength: 200 },
          location: { type: "string", maxLength: 160 },
        },
      },
      selections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            evidenceId: { type: "string", format: "uuid" },
            text: { type: "string" },
          },
          required: ["evidenceId", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["requestId", "revision", "name", "sourceDocumentId", "selections"],
    additionalProperties: false,
  },
  application_propose: {
    type: "object",
    additionalProperties: false,
    required: ["requestId", "revision", "documentId", "changes", "sections"],
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { type: "integer" },
      baselineChanges: baselineChangesSchema,
      baselineOrder: baselineOrderSchema,
      documentId: {
        type: "string",
        format: "uuid",
        description:
          "The application DRAFT document id returned as id by application_read/application_prepare, NEVER its parent applicationId.",
      },
      changes: {
        type: "array",
        maxItems: 80,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["evidenceId", "text"],
          properties: {
            evidenceId: { type: "string", format: "uuid" },
            text: { type: "string", maxLength: 4000 },
          },
        },
      },
      sections: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "text", "evidenceIds"],
          properties: {
            sectionId: { type: "string", format: "uuid" },
            kind: { enum: ["letter", "answer"] },
            question: { type: "string", maxLength: 2000 },
            text: { type: "string", maxLength: 6000 },
            evidenceIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
              maxItems: 20,
            },
          },
        },
      },
      questions: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question"],
          properties: {
            question: { type: "string", minLength: 1, maxLength: 2000 },
            stage: { enum: ["situation", "task", "action", "result"] },
          },
        },
      },
    },
  },
  application_prepare: {
    type: "object",
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { type: "integer" },
      applicationId: { type: "string", format: "uuid" },
      cvVersionId: { type: "string", format: "uuid" },
    },
    required: ["requestId", "revision", "applicationId", "cvVersionId"],
    additionalProperties: false,
  },
};
const organizationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["organizationId"],
  properties: {
    organizationId: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^[a-zA-Z0-9_-]+$",
    },
  },
};
const toolSchemas = {
  stack_filter_options: {
    type: "object",
    additionalProperties: false,
    required: ["facet"],
    properties: {
      facet: { enum: Object.keys(stackFacetColumns) },
      query: {
        type: "string",
        maxLength: 160,
        description:
          "Search ONE exact entity name per call, e.g. facet tags/query TypeScript. For TypeScript OR PostgreSQL, make two searches. Never combine alternative names into one query.",
      },
    },
  },
  profile_update: profileUpdateSchema,
  directions_update: {
    type: "object",
    additionalProperties: false,
    required: ["requestId", "revision", "directions"],
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { type: "integer", minimum: 0 },
      directions: {
        type: "array",
        maxItems: 10,
        uniqueItems: true,
        items: { type: "string", maxLength: 160 },
      },
    },
  },
  cv_update: {
    ...schemas.cv_create,
    properties: {
      ...schemas.cv_create.properties,
      revision: { type: "integer", minimum: 1 },
      cvId: { type: "string", format: "uuid" },
    },
    required: [...schemas.cv_create.required, "cvId"],
  },
  ...schemas,
  stack_update: {
    ...schemas.stack_create,
    properties: {
      ...schemas.stack_create.properties,
      revision: { type: "integer", minimum: 1 },
      stackId: { type: "string", format: "uuid" },
    },
    required: [...schemas.stack_create.required, "stackId"],
  },
  career_propose_fact: {
    type: "object",
    additionalProperties: false,
    required: ["requestId", "revision", "statement"],
    properties: {
      requestId: { type: "string", format: "uuid" },
      revision: { type: "integer", minimum: 0 },
      statement: { type: "string", minLength: 1, maxLength: 4000 },
      kind: { enum: ["role", "responsibility", "technology", "scope", "outcome", "qualification"] },
      documentId: { type: "string", format: "uuid" },
      applicationDocumentId: { type: "string", format: "uuid" },
      answerId: { type: "string", format: "uuid" },
      answerRevision: { type: "integer", minimum: 1 },
      sourceMessageId: {
        type: "string",
        format: "uuid",
        description:
          "Originating candidate request ID from savedConversation when proposing a fact from an earlier answer in this workflow. Omit for the current answer. Never cite an agent response.",
      },
      excerpt: { type: "string", maxLength: 4000 },
      employer: { type: "string", maxLength: 160 },
      role: { type: "string", maxLength: 160 },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
    },
  },
  company_context: organizationSchema,
  network_recommendations: organizationSchema,
};

const uuid = { type: "string", format: "uuid" };
const mutation = { requestId: uuid, revision: { type: "integer", minimum: 0 } };
const paging = { offset: { type: "integer", minimum: 0, maximum: 100000 }, limit: { type: "integer", minimum: 1, maximum: 50 } };
const pages = { page: { type: "integer", minimum: 1, maximum: 10000 }, limit: paging.limit };
const object = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, required });
const change = (properties: Record<string, unknown> = {}, required: string[] = []) => object({ ...mutation, ...properties }, ["requestId", "revision", ...required]);
const textId = { type: "string", minLength: 1, maxLength: 128 };
export const candidateSchemas = {
  ...screeningGovernanceSchemas,
  ...toolSchemas,
  account_status: object(),
  subscription_checkout: object({ requestId: uuid, interval: { enum: ["month", "year"] } }, ["requestId", "interval"]),
  subscription_manage: object(),
  connection_setup: change({ purpose: { enum: ["reasoning", "voice"] } }, ["purpose"]),
  connection_status: object(),
  connection_models: object({ connectionId: uuid }, ["connectionId"]),
  connection_model_set: change({
    connectionId: uuid,
    model: { type: "string", maxLength: 200, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$(?![\\s\\S])" },
    reasoningEffort: { type: ["string", "null"], pattern: "^[a-z][a-z0-9_-]{0,31}$(?![\\s\\S])" },
  }, ["connectionId", "model", "reasoningEffort"]),
  connection_disconnect: change({ connectionId: uuid, purpose: { enum: ["reasoning", "voice"] } }, ["purpose"]),
  setup_status: object({ setupId: uuid }, ["setupId"]),
  source_document_list: object(paging),
  cv_list: object(paging),
  application_list: object(paging),
  stack_list: object(),
  availability_read: object(),
  availability_set: change({ available: { type: "boolean" }, expectedVersion: profileUpdateSchema.properties.expectedVersion }, ["available", "expectedVersion"]),
  screening_preferences_read: object(),
  screening_preferences_update: {
    ...change({
      expectedVersion: profileUpdateSchema.properties.expectedVersion,
      currentLocation: { type: ["string", "null"], minLength: 1, maxLength: 200 },
      relocation: { enum: ["not_open", "specific_locations", "open_anywhere", null] },
      destinations: { type: ["string", "null"], maxLength: 500 },
      notes: { type: ["string", "null"], maxLength: 500 },
      workAuthorization: { type: ["string", "null"], maxLength: 1000 },
      requiresSponsorship: { type: ["boolean", "null"] },
      minimumSalary: { type: ["number", "null"], minimum: 0, maximum: 100000000 },
      salaryCurrency: { type: ["string", "null"], pattern: "^[A-Z]{3}$" },
    }, ["expectedVersion"]),
    anyOf: ["currentLocation", "relocation", "destinations", "notes", "workAuthorization", "requiresSponsorship", "minimumSalary", "salaryCurrency"].map(field => ({ required: [field] })),
  },
  source_text_create: change({ filename: { type: "string", maxLength: 120 }, text: { type: "string", minLength: 1, maxLength: 20000, pattern: "^[^\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]*$" } }, ["text"]),
  source_upload_begin: change({ filename: { type: "string", minLength: 1, maxLength: 240 }, byteLength: { type: "integer", minimum: 1, maximum: 5242880 }, contentType: { enum: ["", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] } }, ["filename", "byteLength", "contentType"]),
  source_upload_status: object({ uploadId: uuid }, ["uploadId"]),
  source_parse: change({ documentId: uuid, purpose: { enum: ["career", "matching"] } }, ["documentId"]),
  source_profile_sync: change({ documentId: uuid }, ["documentId"]),
  source_download: object({ documentId: uuid }, ["documentId"]),
  cv_download: object({ cvId: uuid }, ["cvId"]),
  application_export_download: object({ exportId: uuid }, ["exportId"]),
  introduction_save: change({ id: uuid, organizationId: textId, suggestionId: textId, applicationId: uuid, text: { type: "string", minLength: 1, maxLength: 8000 } }, ["organizationId", "suggestionId", "text"]),
  introduction_update: change({ id: uuid, organizationId: textId, suggestionId: textId, applicationId: uuid, text: { type: "string", minLength: 1, maxLength: 8000 } }, ["id", "organizationId", "suggestionId", "text"]),
  introduction_read: object({ id: uuid }, ["id"]),
  introduction_list: object(paging),
  stack_results: object({ ...pages, stackId: textId }, ["stackId"]),
  cv_match_results: object({ ...pages, documentId: uuid, job: textId }, ["documentId"]),
  recommendations_refresh: candidateMatchingRefreshSchema,
  recommendations_results: candidateMatchingResultsSchema,
  screening_start: change({ documentId: uuid, connectionId: uuid, policyVersion: { type: "string", minLength: 1, maxLength: 180 } }, ["documentId", "connectionId"]),
  screening_status: object({ ...pages, documentId: uuid, runId: uuid, sort: { enum: [...screeningMetrics, "overall_score", "evidence_coverage"] }, direction: { enum: ["asc", "desc"] } }, ["documentId"]),
  screening_control: change({ runId: uuid, action: { enum: ["pause", "resume"] } }, ["runId", "action"]),
  career_run: change({ sessionId: uuid, connectionId: uuid, prompt: { type: "string", minLength: 1, maxLength: 20000 }, sourceDocumentId: uuid, shortUUID: textId, classification: { type: "string", minLength: 1, maxLength: 120 } }, ["prompt"]),
  career_result: object({ requestId: uuid }, ["requestId"]),
  career_cancel: change({ agentRequestId: uuid }, ["agentRequestId"]),
  application_export: change({ documentId: uuid, kind: { enum: ["cv", "letter", "answers"] } }, ["documentId", "kind"]),
  application_exports: object(paging),
  application_export_provenance: object({ exportId: uuid }, ["exportId"]),
  application_action: change({ shortUUID: textId, action: { enum: ["pass", "block_company", "unblock_company", "interested", "save", "applied", "preparing", "interview", "offer", "rejected", "withdrawn", "undo"] }, reason: { type: "string", maxLength: 500 }, surface: { enum: ["discover_cards", "discover_list", "stack_cards", "stack_list", "applications"] }, rankingVersion: { type: "string", maxLength: 100 }, undoRequestId: uuid }, ["shortUUID", "action", "surface"]),
};
export type CandidateCapabilityName = keyof typeof candidateSchemas;
