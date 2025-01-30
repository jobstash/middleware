import { Transform, Type } from "class-transformer";
import { IsString, IsIn } from "class-validator";
import { toList } from "src/shared/helpers";

export class FetchPillarItemLabelsInput {
  @IsString()
  @IsIn(["projects", "organizations", "grants", "impact", "vcs"])
  nav: "projects" | "organizations" | "grants" | "impact" | "vcs";

  @Type(() => String)
  @Transform(toList)
  pillars: string[];

  @Type(() => String)
  @Transform(toList)
  slugs: string[];
}
