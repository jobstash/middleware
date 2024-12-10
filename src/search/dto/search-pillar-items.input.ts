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
  @IsIn(["projects", "organizations", "grants", "grantsImpact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "grantsImpact" | "vcs";

  @IsString()
  @IsNotEmpty()
  pillar: string;

  @IsString()
  @IsNotEmpty()
  query: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page: number | null = null;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit: number | null = null;
}
