import { Type } from "class-transformer";
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
} from "class-validator";

export class SearchPillarItemParams {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "impact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "impact" | "vcs";

  @IsString()
  @IsNotEmpty()
  pillar: string;

  @IsString()
  @IsOptional()
  query: string | null = null;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page: number | null = null;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit: number | null = null;
}
