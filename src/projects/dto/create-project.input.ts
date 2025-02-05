import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  tvl?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyFees?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyVolume?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyRevenue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyActiveUsers?: number | null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty()
  @IsOptional()
  @IsUrl()
  logo?: string;

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
  github?: string;

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
  tokenAddress?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tokenSymbol?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  defiLlamaId?: string | null;

  @ApiProperty()
  @IsOptional()
  @IsString()
  defiLlamaSlug?: string | null;

  @ApiProperty()
  @IsOptional()
  @IsString()
  defiLlamaParent?: string | null;
}
