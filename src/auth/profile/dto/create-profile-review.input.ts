import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
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
