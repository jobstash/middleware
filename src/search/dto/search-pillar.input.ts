import { IsString, IsOptional } from "class-validator";
import { SearchPillarFiltersParams } from "./search-pillar-filters-params.input";

export class SearchPillarParams extends SearchPillarFiltersParams {
  @IsString()
  @IsOptional()
  pillar?: string | null = null;

  @IsString()
  @IsOptional()
  item?: string | null = null;
}
