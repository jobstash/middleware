import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

const IMPORT_SOURCES = [
  "jobposts",
  "thegrid",
  "crypto_fundraising",
  "de_fi",
  "defillama",
  "hirechain",
  "oso",
  "google_sheets",
  "jobsite_probe",
  "pillar",
] as const;
const JOBPOST_SCOPES = ["all", "sources", "organization", "jobsite"] as const;
const SOURCE_SECTIONS = [
  "all",
  "organizations",
  "projects",
  "funds",
  "recent",
  "audits",
  "hacks",
  "definitions",
  "items",
] as const;
const COLLISION_STATUSES = ["needs_review", "resolved"] as const;
const COLLISION_RESOLUTIONS = [
  "same_item",
  "shared_website",
  "keep_separate",
  "reassigned",
] as const;
const TARGET_LABELS = [
  "EntityProfile",
  "ProfileInfo",
  "Organization",
  "Project",
] as const;
const STRUCTURED_REVIEW_REQUIREMENTS = [
  "adjacent_title_fde",
  "classification_review_reason",
] as const;
const ENTITY_ENRICHMENT_OPERATIONS = [
  "profiles",
  "reviews",
  "sparse",
  "detected",
  "all",
] as const;

export class CreateEntityEnrichmentRunDto {
  @IsIn(ENTITY_ENRICHMENT_OPERATIONS)
  operation: (typeof ENTITY_ENRICHMENT_OPERATIONS)[number];

  @IsOptional()
  @IsString()
  @Length(1, 200)
  target?: string;

  @IsOptional()
  @IsBoolean()
  fresh?: boolean;

  @IsOptional()
  @IsBoolean()
  retryFailed?: boolean;
}

export class InferenceSubscriptionMetadataDto {
  @ApiProperty({ enum: ["openai"] })
  provider: "openai";

  @ApiProperty({ enum: ["chatgpt_subscription"] })
  accessMode: "chatgpt_subscription";

  @ApiProperty({ enum: ["codex_exec"] })
  launcher: "codex_exec";

  @ApiProperty({
    description: "Exact OpenAI model catalog slug configured by the launcher",
  })
  model: string;
}

export class InferenceCapabilityPreflightDto {
  @ApiProperty({ type: InferenceSubscriptionMetadataDto })
  inference: InferenceSubscriptionMetadataDto;

  @ApiProperty({ description: "Installed Codex CLI version" })
  version: string;
}

export class InferenceRunTelemetryDto {
  @ApiProperty({ type: InferenceSubscriptionMetadataDto })
  inference: InferenceSubscriptionMetadataDto;

  @ApiProperty({ minimum: 0 })
  uniqueInventoryCount: number;

  @ApiProperty({ minimum: 0 })
  alreadyCompletedCanaryCount: number;

  @ApiProperty({ minimum: 0 })
  maximumRemainingCalls: number;

  @ApiProperty({ minimum: 0, description: "Durable calls launched once" })
  callsStarted: number;

  @ApiProperty({ minimum: 0 })
  successfulResults: number;

  @ApiProperty({ minimum: 0 })
  callOutcomeUnknown: number;

  @ApiProperty({ minimum: 0 })
  prelaunchFailures: number;

  @ApiProperty({ minimum: 0, description: "Must remain zero" })
  paidFallbackCount: number;
}

@ValidatorConstraint({ name: "structuredRefreshScopeShape", async: false })
class StructuredRefreshScopeShape implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined) return true;
    if (value === null || typeof value !== "object") return false;
    const scope = value as Record<string, unknown>;
    return scope.kind !== "all" || scope.canarySize === undefined;
  }

  defaultMessage(): string {
    return "canarySize is valid only when scope.kind is canary";
  }
}

export class CreateImportRunDto {
  @IsIn(IMPORT_SOURCES)
  source: (typeof IMPORT_SOURCES)[number];

  @IsString()
  @Length(8, 200)
  idempotencyKey: string;

  @IsOptional()
  @IsIn(JOBPOST_SCOPES)
  scope?: (typeof JOBPOST_SCOPES)[number];

  @IsOptional()
  @IsIn(SOURCE_SECTIONS)
  section?: (typeof SOURCE_SECTIONS)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50_000)
  limit?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  jobsiteUrl?: string;
}

export class StructuredRefreshScopeDto {
  @IsIn(["canary", "all"])
  kind: "canary" | "all";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  canarySize?: number;
}

export class CreateStructuredRefreshDto {
  @IsString()
  @Length(8, 200)
  idempotencyKey: string;

  @IsOptional()
  @Validate(StructuredRefreshScopeShape)
  @ValidateNested()
  @Type(() => StructuredRefreshScopeDto)
  scope?: StructuredRefreshScopeDto = Object.assign(
    new StructuredRefreshScopeDto(),
    { kind: "canary" as const, canarySize: 30 },
  );

  @IsOptional()
  @IsString()
  @Length(1, 200)
  extractorVersion?: string;
}

export class StructuredRefreshApprovedItemDto {
  @IsString()
  @Matches(/^\d+$/)
  rawJobNodeId: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  stagedFingerprint: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(STRUCTURED_REVIEW_REQUIREMENTS, { each: true })
  approvedReviewRequirements: Array<
    (typeof STRUCTURED_REVIEW_REQUIREMENTS)[number]
  >;
}

export class PublishStructuredRefreshDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedDiffFingerprint: string;

  @IsArray()
  @ArrayUnique(item => item.rawJobNodeId)
  @ValidateNested({ each: true })
  @Type(() => StructuredRefreshApprovedItemDto)
  approvedItems: StructuredRefreshApprovedItemDto[];
}

export class ExecuteInferenceBatchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  limit?: number;
}

export class CollisionListQueryDto {
  @IsOptional()
  @IsIn(COLLISION_STATUSES)
  status: (typeof COLLISION_STATUSES)[number] = "needs_review";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
}

export class CollisionDetailQueryDto {
  @IsOptional()
  @IsIn(COLLISION_STATUSES)
  status: (typeof COLLISION_STATUSES)[number] = "needs_review";
}

export class CollisionReassignmentDto {
  @IsString()
  source: string;

  @IsString()
  sourceObjectKind: string;

  @IsString()
  stableExternalId: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  fromTargetNodeId?: string | null;

  @IsString()
  @Matches(/^\d+$/)
  toTargetNodeId: string;

  @IsIn(TARGET_LABELS)
  toTargetLabel: (typeof TARGET_LABELS)[number];

  @IsIn(["same_item", "shared_website"])
  urlDecision: "same_item" | "shared_website";

  @IsObject()
  evidence: Record<string, unknown>;
}

export class CollisionUrlResolutionDto {
  @IsUrl({ require_protocol: true })
  normalizedUrl: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  claimIds: string[];

  @IsObject()
  evidence: Record<string, unknown>;
}

export class CollisionSameItemDto {
  @IsIn(["EntityProfile", "Organization", "Project"])
  targetLabel: "EntityProfile" | "Organization" | "Project";

  @IsString()
  @Matches(/^\d+$/)
  canonicalTargetNodeId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Matches(/^\d+$/, { each: true })
  duplicateTargetNodeIds: string[];

  @IsObject()
  evidence: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  aliasesToPreserve?: string[];

  @IsNumber()
  @Min(0.98)
  @Max(1)
  confidence: number;
}

export class ResolveCollisionDto {
  @IsString()
  @Length(1, 512)
  @Matches(/\S/)
  expectedFingerprint: string;

  @IsIn(COLLISION_RESOLUTIONS)
  resolution: (typeof COLLISION_RESOLUTIONS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => CollisionReassignmentDto)
  reassignment?: CollisionReassignmentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CollisionUrlResolutionDto)
  urlResolution?: CollisionUrlResolutionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CollisionSameItemDto)
  sameItem?: CollisionSameItemDto;
}
