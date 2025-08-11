import {
  Controller,
  Get,
  Headers,
  Query,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { SearchService } from "./search.service";
import {
  PaginatedData,
  PillarInfo,
  RangeFilter,
  ResponseWithOptionalData,
  SearchNav,
  SearchResult,
  SelectFilter,
  SessionObject,
} from "src/shared/interfaces";
import { SearchPillarParams } from "./dto/search-pillar.input";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { PBACGuard } from "src/auth/pbac.guard";
import { CACHE_DURATION_1_HOUR, ECOSYSTEM_HEADER } from "src/shared/constants";
import { Session } from "src/shared/decorators";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ProfileService } from "src/auth/profile/profile.service";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";
import { SearchParams } from "./dto/search.input";
import { SearchPillarFiltersParams } from "./dto/search-pillar-filters-params.input";
import { ApiHeader } from "@nestjs/swagger";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("search")
export class SearchController {
  private readonly logger = new CustomLogger(SearchController.name);
  constructor(
    private readonly searchService: SearchService,
    private readonly profileService: ProfileService,
  ) {}

  @Get("")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
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
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async searchPillar(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true })) params: SearchPillarParams,
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    const query = JSON.stringify({
      ...params,
      ecosystem: ecosystem ?? null,
    });
    this.logger.log(`/search/pillar ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    return this.searchService.searchPillar(params, ecosystem);
  }

  @Get("pillar/items")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async searchPillarItems(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: SearchPillarItemParams,
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<PaginatedData<string>> {
    const query = JSON.stringify({
      ...params,
      ecosystem: ecosystem ?? null,
    });
    this.logger.log(`/search/pillar/items ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillarItems(
      params,
      ecosystem,
    );
    return result;
  }

  @Get("pillar/slugs")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async searchPillarSlugs(
    @Session() { address }: SessionObject,
    @Query("nav") nav: SearchNav,
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<string[]> {
    const query = JSON.stringify({
      nav,
      ecosystem: ecosystem ?? null,
    });
    this.logger.log(`/search/pillar/items ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillarSlugs(nav, ecosystem);
    return result;
  }

  @Get("pillar/details")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async searchPillarDetailsBySlug(
    @Session() { address }: SessionObject,
    @Query("nav") nav: SearchNav,
    @Query("slug") slug: string,
  ): Promise<
    ResponseWithOptionalData<{
      title: string;
      description: string;
    }>
  > {
    const query = JSON.stringify({
      nav,
      slug,
    });
    this.logger.log(`/search/pillar/details ${query}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, query);
    }
    const result = await this.searchService.searchPillarDetailsBySlug(
      nav,
      slug,
    );
    return result;
  }

  @Get("pillar/filters")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async searchPillarFilters(
    @Query(new ValidationPipe({ transform: true }))
    params: SearchPillarFiltersParams,
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<(RangeFilter | SelectFilter)[]>> {
    this.logger.log(`/search/pillar/filters ${JSON.stringify(params)}`);
    return this.searchService.searchPillarFilters(params, ecosystem);
  }

  @Get("pillar/labels")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
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
