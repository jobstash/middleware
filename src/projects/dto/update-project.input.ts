import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, IsNumber } from "class-validator";

export class UpdateProjectInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  githubOrganization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  teamSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discord?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isMainnet?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tokenSymbol?: string;
}
