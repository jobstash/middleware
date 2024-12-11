import { IsString, IsNotEmpty, IsIn } from "class-validator";

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
}
