import { Transform, Type } from "class-transformer";
import { IsString, IsIn, IsOptional } from "class-validator";
import { toList } from "src/shared/helpers";

export class SearchParams {
  @IsString()
  @IsOptional()
  @IsIn(["projects", "organizations", "grants", "grantsImpact", "vcs"])
  nav?:
    | "projects"
    | "organizations"
    | "grants"
    | "grantsImpact"
    | "vcs"
    | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  excluded?: string[] | null = null;

  @IsString()
  @IsOptional()
  query?: string | null = null;
}
