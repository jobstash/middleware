import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { SearchService } from "./search.service";
import {
  PaginatedData,
  PillarInfo,
  ResponseWithOptionalData,
  SearchResult,
  SessionObject,
} from "src/shared/interfaces";
import { SearchPillarParams } from "./dto/search.input";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/constants";
import { Session } from "src/shared/decorators";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ProfileService } from "src/auth/profile/profile.service";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";

@Controller("search")
export class SearchController {
  private readonly logger = new CustomLogger(SearchController.name);
  constructor(
    private readonly searchService: SearchService,
    private readonly profileService: ProfileService,
  ) {}

  @Get("")
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async search(
    @Session() { address }: SessionObject,
    @Query("query") query: string = null,
  ): Promise<SearchResult> {
    if (query) {
      this.logger.log(`/search ${query}`);
      if (address) {
        await this.profileService.logSearchInteraction(address, query);
      }
    }
    return this.searchService.search(query);
  }

  @Get("pillar")
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async searchPillar(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true })) params: SearchPillarParams,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    const query = JSON.stringify(params);
    this.logger.log(`/search/pillar ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillar(params);
    if (result.success) {
      return result;
    } else {
      throw new NotFoundException(result);
    }
  }

  @Get("pillar/items")
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async searchPillarItems(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: SearchPillarItemParams,
  ): Promise<PaginatedData<string>> {
    const query = JSON.stringify(params);
    this.logger.log(`/search/pillar/items ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillarItems(params);
    if (result.count > 0) {
      return result;
    } else {
      throw new NotFoundException(result);
    }
  }

  @Get("pillar/labels")
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async fetchPillarLabels(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: FetchPillarItemLabelsInput,
  ): Promise<
    ResponseWithOptionalData<
      {
        slug: string;
        label: string;
      }[]
    >
  > {
    const query = JSON.stringify(params);
    this.logger.log(`/search/pillar/lablels ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    return this.searchService.fetchPillarItemLabels(params);
  }
}
