import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class UpdateEntityProfileInfoInput {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  canonicalSite?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  tagline?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  foundingDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  profileType?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  profileSector?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  profileStatus?: string | null;
}

export class UpdateEntityProfileInput {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { each: true })
  aliases: string[];

  @ApiProperty({ type: UpdateEntityProfileInfoInput })
  @ValidateNested()
  @Type(() => UpdateEntityProfileInfoInput)
  info: UpdateEntityProfileInfoInput;
}
