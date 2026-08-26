import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsNotEmptyObject,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateProfileReviewInput {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  childId?: string | null;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reviewText: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number | null;

  @ApiPropertyOptional({ nullable: true, example: "USD" })
  @ValidateIf(input => input.salary !== null && input.salary !== undefined)
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  offersTokenAllocation?: boolean | null;
}

export class CreateRecruiterCaseInput {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  childId?: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  @IsNotEmptyObject()
  allegation: Record<string, unknown>;
}

export class CreateProfileAppealInput {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  appealText: string;
}

export class ModerateProfileReviewInput {
  @ApiProperty({ enum: ["published", "redacted", "removed"] })
  @IsIn(["published", "redacted", "removed"])
  status: "published" | "redacted" | "removed";

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(input => input.status === "redacted")
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  redactedPublicText?: string | null;
}

export class ModerateRecruiterCaseInput {
  @ApiProperty({ enum: ["investigating", "decided", "dismissed"] })
  @IsIn(["investigating", "decided", "dismissed"])
  status: "investigating" | "decided" | "dismissed";

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(input => input.status !== "investigating")
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  decisionText?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  publishWarning?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(input => input.publishWarning === true)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  warningText?: string | null;
}

export class ModerateProfileAppealInput {
  @ApiProperty({ enum: ["upheld", "granted"] })
  @IsIn(["upheld", "granted"])
  status: "upheld" | "granted";

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  decisionText: string;
}
