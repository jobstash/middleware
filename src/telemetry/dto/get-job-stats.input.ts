import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class GetJobStatsInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortUUID?: string | null = null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  epochStart?: number | null = null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  epochEnd?: number | null = null;
}
