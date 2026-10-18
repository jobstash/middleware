import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MutationInput } from "./career.dto";
export class CvRequirementReview {
  @IsString() @MinLength(12) @MaxLength(2000) requirement: string;
  @IsIn([
    "Technical skills",
    "Delivery",
    "Leadership",
    "Domain",
    "Experience",
    "Education",
    "Role scope",
  ])
  dimension: string;
  @IsIn(["supported", "partial", "gap", "unclear"]) state: string;
  @IsOptional() @IsString() @MaxLength(4000) cvExcerpt?: string;
  @IsString() @MinLength(1) @MaxLength(2000) feedback: string;
}
export class CvReviewInput extends MutationInput {
  @IsUUID() documentId: string;
  @IsString() @MinLength(1) @MaxLength(128) shortUUID: string;
  @Matches(/^[a-f0-9]{32}$/) cvHash: string;
  @Matches(/^[a-f0-9]{32}$/) adHash: string;
  @IsString() @MinLength(1) @MaxLength(3000) summary: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CvRequirementReview)
  requirements: CvRequirementReview[];
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  nextSteps: string[];
}
