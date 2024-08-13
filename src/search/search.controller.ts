import { Controller, Get, Query } from "@nestjs/common";
import { SearchService } from "./search.service";
import { SearchResult } from "src/shared/interfaces";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("")
  async search(@Query("query") query: string): Promise<SearchResult> {
    return this.searchService.search(query);
  }
}
