import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsNumber,
} from "class-validator";

export class CreateProjectInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUrl()
  url: string;

  @ApiProperty()
  @IsNotEmpty()
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
