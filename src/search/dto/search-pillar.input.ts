import { IsString, IsIn, IsOptional } from "class-validator";

export class SearchPillarParams {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "impact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "impact" | "vcs";

  @IsString()
  @IsOptional()
  pillar?: string | null = null;

  @IsString()
  @IsOptional()
  item?: string | null = null;
}
