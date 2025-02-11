import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { SearchService } from "./search.service";
import {
  PaginatedData,
  PillarInfo,
  RangeFilter,
  ResponseWithOptionalData,
  SearchResult,
  SelectFilter,
  SessionObject,
} from "src/shared/interfaces";
import { SearchPillarParams } from "./dto/search-pillar.input";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
  COMMUNITY_HEADER,
} from "src/shared/constants";
import { Session } from "src/shared/decorators";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ProfileService } from "src/auth/profile/profile.service";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";
import { SearchParams } from "./dto/search.input";
import { SearchPillarFiltersParams } from "./dto/search-pillar-filters-params.input";
import { ApiHeader } from "@nestjs/swagger";

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
    @Query(new ValidationPipe({ transform: true })) params: SearchParams,
  ): Promise<SearchResult> {
    if (params) {
      this.logger.log(`/search ${JSON.stringify(params)}`);
      if (address) {
        await this.profileService.logSearchInteraction(
          address,
          JSON.stringify(params),
        );
      }
    }
    return this.searchService.search(params);
  }

  @Get("pillar")
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async searchPillar(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true })) params: SearchPillarParams,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    const query = JSON.stringify({
      ...params,
      community: community ?? null,
    });
    this.logger.log(`/search/pillar ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillar(params, community);
    if (result.success) {
      return result;
    } else {
      throw new NotFoundException(result);
    }
  }

  @Get("pillar/items")
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async searchPillarItems(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: SearchPillarItemParams,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<PaginatedData<string>> {
    const query = JSON.stringify({
      ...params,
      community: community ?? null,
    });
    this.logger.log(`/search/pillar/items ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillarItems(
      params,
      community,
    );
    return result;
  }

  @Get("pillar/filters")
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  async searchPillarFilters(
    @Query(new ValidationPipe({ transform: true }))
    params: SearchPillarFiltersParams,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<ResponseWithOptionalData<(RangeFilter | SelectFilter)[]>> {
    this.logger.log(`/search/pillar/filters ${JSON.stringify(params)}`);
    return this.searchService.searchPillarFilters(params, community);
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
