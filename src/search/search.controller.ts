import {
  Controller,
  Get,
  NotFoundException,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import { SearchService } from "./search.service";
import {
  PaginatedData,
  PillarInfo,
  ResponseWithOptionalData,
  SearchResult,
} from "src/shared/interfaces";
import { SearchPillarParams } from "./dto/search.input";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("")
  async search(@Query("query") query: string): Promise<SearchResult> {
    return this.searchService.search(query);
  }

  @Get("pillar")
  async searchPillar(
    @Query(new ValidationPipe({ transform: true })) params: SearchPillarParams,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    const result = await this.searchService.searchPillar(params);
    if (result.success) {
      return result;
    } else {
      throw new NotFoundException(result);
    }
  }

  @Get("pillar/items")
  async searchPillarItems(
    @Query(new ValidationPipe({ transform: true }))
    params: SearchPillarItemParams,
  ): Promise<PaginatedData<string>> {
    const result = await this.searchService.searchPillarItems(params);
    if (result.count > 0) {
      return result;
    } else {
      throw new NotFoundException(result);
    }
  }
}
