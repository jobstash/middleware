import { Type } from "class-transformer";
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
} from "class-validator";

export class SearchPillarParams {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "grantsImpact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "grantsImpact" | "vcs";

  @IsString()
  @IsNotEmpty()
  pillar: string;

  @IsString()
  @IsNotEmpty()
  item: string;

  @IsString()
  @IsOptional()
  pillar2: string | null = null;

  @IsString()
  @IsOptional()
  item2: string | null = null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit: number | null = null;
}
