import { IsString, IsIn, IsOptional } from "class-validator";

export class SearchPillarParams {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "grantsImpact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "grantsImpact" | "vcs";

  @IsString()
  @IsOptional()
  pillar?: string | null = null;

  @IsString()
  @IsOptional()
  item?: string | null = null;
}
