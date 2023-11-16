import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, IsNumber } from "class-validator";

export class UpdateProjectInput {
  @ApiProperty()
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  category: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty()
  @IsOptional()
  @IsUrl()
  url: string;

  @ApiProperty()
  @IsOptional()
  @IsUrl()
  logo: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  githubOrganization?: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  teamSize?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  twitter?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  discord?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  docs?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  isMainnet?: boolean;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tokenSymbol?: string;
}
