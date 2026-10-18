import { StackFilters } from "./stack-filters";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class MutationInput {
  @IsUUID() requestId: string;
  @IsInt() @Min(0) revision: number;
}
export class CandidateBillingMutationInput {
  @IsUUID() requestId: string;
}
export class CandidateCheckoutInput extends CandidateBillingMutationInput {
  @IsIn(["month", "year"]) interval: "month" | "year";
}
export class EvidenceInput extends MutationInput {
  @IsOptional() @IsUUID() applicationDocumentId?: string;
  @IsOptional() @IsUUID() answerId?: string;
  @IsOptional() @IsInt() @Min(1) answerRevision?: number;
  @IsOptional() @IsUUID() sourceMessageId?: string;
  @IsString() @MinLength(1) @MaxLength(4000) statement: string;
  @IsOptional() @IsIn(["role", "responsibility", "technology", "scope", "outcome", "qualification"])
  kind?: "role" | "responsibility" | "technology" | "scope" | "outcome" | "qualification";
  @IsOptional() @IsString() @MaxLength(160) employer?: string;
  @IsOptional() @IsString() @MaxLength(160) role?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @IsUUID() documentId?: string;
  @IsOptional() @IsString() @MaxLength(4000) excerpt?: string;
}
export class DocumentInput {
  @IsUUID() id: string;
  @Matches(/^[a-f0-9]{64}$/) contentHash: string;
  @IsString() @MinLength(1) @MaxLength(255) filename: string;
  @IsOptional() @IsString() @MaxLength(100000) sourceText?: string;
}
export class StackKeywords {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  all?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  any?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  exclude?: string[];
}
export class StackInput extends MutationInput {
  @IsOptional() @IsObject() filters?: StackFilters;
  @IsOptional()
  @ValidateNested()
  @Type(() => StackKeywords)
  keywords?: StackKeywords;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(["remote", "hybrid", "onsite"], { each: true })
  workModes?: ("remote" | "hybrid" | "onsite")[];
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsIn(["best", "fresh", "direction", "adjacent", "network"]) intent: string;
  @IsBoolean() pinned: boolean;
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  classifications: string[];
}
export class ActionInput extends MutationInput {
  @IsString() @MinLength(1) @MaxLength(128) shortUUID: string;
  @IsIn([
    "pass",
    "block_company",
    "unblock_company",
    "interested",
    "save",
    "applied",
    "preparing",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
    "undo",
  ])
  action: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsIn([
    "discover_cards",
    "discover_list",
    "stack_cards",
    "stack_list",
    "applications",
  ])
  surface: string;
  @IsOptional() @IsString() @MaxLength(100) rankingVersion?: string;
  @IsOptional() @IsUUID() undoRequestId?: string;
}
export class PageInput {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class EvidenceSelection {
  @IsUUID() evidenceId: string;
  @IsString() @MinLength(1) @MaxLength(4000) text: string;
}
export class CvInput extends MutationInput {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => EvidenceSelection)
  selections: EvidenceSelection[];
}

export class PasteCvInput {
  @IsOptional() @IsString() @MaxLength(120) filename?: string;
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  @Matches(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]*$/)
  text: string;
}

export class CvMatchPageInput extends PageInput {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) job?: string;
}

export class LinkResumeInput {
  @IsUUID() documentId: string;
  @IsString() @MaxLength(200) origin: string;
  @IsOptional() @IsBoolean() onlyIfMissing?: boolean;
}
