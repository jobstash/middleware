import { Transform, Type } from "class-transformer";
import { IsString, IsIn, IsOptional } from "class-validator";
import { toList } from "src/shared/helpers";

export class SearchParams {
  @IsString()
  @IsOptional()
  @IsIn(["projects", "organizations", "vcs"])
  nav?: "projects" | "organizations" | "vcs" | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  excluded?: string[] | null = null;

  @IsString()
  @IsOptional()
  query?: string | null = null;
}
