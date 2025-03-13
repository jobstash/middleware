import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

export class GetAvailableUsersInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  city: string | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  country: string | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit: number | null = null;
}
