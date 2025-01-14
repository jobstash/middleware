import { IsString, IsIn, IsArray } from "class-validator";

export class FetchPillarItemLabelsInput {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "grantsImpact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "grantsImpact" | "vcs";

  @IsArray()
  pillars: string[];

  @IsArray()
  slugs: string[];
}
