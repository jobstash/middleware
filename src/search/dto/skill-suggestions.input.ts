import {
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export class SkillSuggestionsInput {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim() || undefined)
  q?: string;

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
