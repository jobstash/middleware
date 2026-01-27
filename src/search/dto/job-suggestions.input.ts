import {
  IsString,
  IsOptional,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export const SUGGESTION_GROUPS = [
  "jobs",
  "organizations",
  "tags",
  "classifications",
  "locations",
  "investors",
  "fundingRounds",
] as const;

export type SuggestionGroupId = (typeof SUGGESTION_GROUPS)[number];

export class JobSuggestionsInput {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim() || undefined)
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(SUGGESTION_GROUPS)
  group?: SuggestionGroupId = "jobs";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
