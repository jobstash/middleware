import { Transform, Type } from "class-transformer";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { toList } from "src/shared/helpers";
import { SearchNav } from "src/shared/interfaces";

export class SearchPillarFiltersParams {
  @IsString()
  @IsNotEmpty()
  @IsIn(["projects", "organizations", "grants", "impact", "vcs"])
  nav: SearchNav;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  categories?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  chains?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  investors?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  names?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  tags?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  locations?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  fundingRounds?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  ecosystems?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  organizations?: string[] | null = null;
}

//
// [{ pillar: "categories", items: ["Dexes"] }, { pillar: "chains", items: ["Ethereum"] }]
// {
//   categories: ["Dexes"],
//   chains: ["Ethereum"]
//   investors: [{ name: "Investor 1", normalizedName: "investor1" }, { name: "Investor 2", normalizedName: "investor2" }]
//   name: "Project 1"
//   tags: ["Tag 1", "Tag 2"]
// }
