import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class RateOrgInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  management: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  careerGrowth: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  benefits: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  workLifeBalance: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  cultureValues: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  diversityInclusion: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  interviewProcess: number | null;
}
