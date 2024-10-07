import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateDevLinkedAccountsInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discord: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegram: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  farcaster: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitter: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  google: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  github: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apple: string | null;
}
