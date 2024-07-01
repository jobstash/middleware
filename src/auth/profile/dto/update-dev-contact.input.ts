import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString } from "class-validator";

export class UpdateDevContactInput {
  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email: string | null;

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
  lens: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitter: string | null;
}
