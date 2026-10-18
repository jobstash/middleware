import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, Validate, ValidateIf, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";
import { MutationInput } from "./career.dto";

export const candidateMatchingPageSize = 50;
export const candidateMatchingMaxPageSize = 100;
export const candidateMatchingMaxOffset = Number.MAX_SAFE_INTEGER;
export const candidateMatchingSorts = ["recommended", "score-desc", "score-asc"] as const;
export type CandidateMatchingSort = typeof candidateMatchingSorts[number];

@ValidatorConstraint({ name: "matchingScoreRange", async: false })
class MatchingScoreRange implements ValidatorConstraintInterface {
  validate(value: number, { object }: ValidationArguments): boolean {
    const { minScore } = object as CandidateMatchingResultsInput;
    return minScore === undefined || value >= minScore;
  }
  defaultMessage(): string { return "maxScore must be greater than or equal to minScore"; }
}

export class CandidateMatchingResultsInput {
  @IsUUID() documentId: string;
  @IsOptional() @IsUUID() connectionId?: string;
  @IsOptional() @IsUUID() runId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(candidateMatchingMaxOffset) offset = 0;
  @IsOptional() @IsInt() @Min(1) @Max(candidateMatchingMaxPageSize) limit = candidateMatchingPageSize;
  @ValidateIf((_object, value) => value !== undefined) @IsIn(candidateMatchingSorts)
  sort?: CandidateMatchingSort;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(100)
  minScore?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(100) @Validate(MatchingScoreRange)
  maxScore?: number;
}

export class CandidateMatchingRefreshInput extends MutationInput {
  @IsUUID() documentId: string;
  @IsOptional() @IsUUID() connectionId?: string;
  @IsOptional() @IsUUID() runId?: string;
  @IsOptional() @IsIn(["append"]) mode?: "append";
  @IsOptional() @IsString() @MaxLength(2000) searchGoal?: string;
  @IsOptional() @IsInt() @Min(0) @Max(candidateMatchingMaxOffset) offset = 0;
  @IsOptional() @IsInt() @Min(1) @Max(candidateMatchingMaxPageSize) limit = candidateMatchingPageSize;
}

const matchingProperties = {
  documentId: { type: "string", format: "uuid" },
  connectionId: { type: "string", format: "uuid" },
  runId: { type: "string", format: "uuid" },
  offset: { type: "integer", minimum: 0, maximum: candidateMatchingMaxOffset, default: 0 },
  limit: { type: "integer", minimum: 1, maximum: candidateMatchingMaxPageSize, default: candidateMatchingPageSize },
};

export const candidateMatchingResultsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documentId"],
  properties: {
    ...matchingProperties,
    sort: { type: "string", enum: candidateMatchingSorts, default: "recommended" },
    minScore: { type: "integer", minimum: 0, maximum: 100 },
    maxScore: { type: "integer", minimum: 0, maximum: 100, description: "Inclusive upper bound; must be greater than or equal to minScore when both are supplied." },
  },
};

export const candidateMatchingRefreshSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "revision", "documentId"],
  properties: {
    ...matchingProperties,
    searchGoal: { type: "string", maxLength: 2000 },
    mode: { enum: ["append"], description: "Append only new eligible jobs to runId, retaining its source, goal, provider, model and saved assessments." },
    requestId: { type: "string", format: "uuid" },
    revision: { type: "integer", minimum: 0 },
  },
};
