import { AI_CATEGORIES, AiCategory } from "../../shared/ai-categories";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export const ORGANIZATION_VERTICALS = [
  "crypto",
  "fintech",
  "ai",
  "robotics",
  "banking",
  "tech",
  "out_of_scope",
  "unclassified",
] as const;

export class UpdateOrganizationClassificationInput {
  @IsOptional()
  @IsIn(AI_CATEGORIES)
  aiPrimaryCategory?: AiCategory | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(14)
  @IsIn(AI_CATEGORIES, { each: true })
  aiCategories?: AiCategory[];

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedVertical: string | null;

  @ApiProperty({ enum: ORGANIZATION_VERTICALS })
  @IsIn(ORGANIZATION_VERTICALS)
  vertical: (typeof ORGANIZATION_VERTICALS)[number];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1800)
  reason: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidence?: string[];
}
