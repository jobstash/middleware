import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsUUID } from "class-validator";

export class GetAvailableUsersInput {
  @ApiProperty()
  @IsUUID()
  workspaceId: string;

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

export class GetAvailableUsersAdminInput {
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
