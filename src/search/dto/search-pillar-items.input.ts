import { Type } from "class-transformer";
import { IsString, IsNotEmpty, IsOptional, IsNumber } from "class-validator";
import { SearchPillarFiltersParams } from "./search-pillar-filters-params.input";

export class SearchPillarItemParams extends SearchPillarFiltersParams {
  @IsString()
  @IsNotEmpty()
  pillar: string;

  @IsString()
  @IsOptional()
  query: string | null = null;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page: number | null = null;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit: number | null = null;
}
