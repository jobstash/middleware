import { Transform, Type } from "class-transformer";
import { IsString, IsNotEmpty, IsIn, IsOptional } from "class-validator";
import { toList } from "src/shared/helpers";

export class FetchPillarItemLabelsInput {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "grantsImpact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "grantsImpact" | "vcs";

  @IsString()
  @IsNotEmpty()
  pillar: string;

  @IsString()
  @IsOptional()
  query: string | null = null;

  @Type(() => String)
  @Transform(toList)
  inputs?: string[];
}
