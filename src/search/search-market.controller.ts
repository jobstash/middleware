import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SearchService } from "./search.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { CACHE_DURATION_1_HOUR } from "src/shared/constants";
import { ResponseWithOptionalData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import {
  JobMarketOverviewData,
  JobMarketSkillDetailData,
  JobMarketSkillListData,
  JobMarketStateData,
  JobMarketTopPayingData,
  PillarMarketData,
} from "./dto/job-market.output";

@Controller("search/market")
export class SearchMarketController {
  private readonly logger = new CustomLogger(SearchMarketController.name);
  constructor(private readonly searchService: SearchService) {}

  @Get("overview")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketOverview(): Promise<
    ResponseWithOptionalData<JobMarketOverviewData>
  > {
    this.logger.log("/search/market/overview");
    return this.searchService.getMarketOverview();
  }

  @Get("state")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketState(
    @Query("range") range = "max",
    @Query("classification") classification = "market",
  ): Promise<ResponseWithOptionalData<JobMarketStateData>> {
    this.logger.log(
      `/search/market/state?range=${range}&classification=${classification}`,
    );
    return this.searchService.getMarketState(range, classification);
  }

  @Get("top-paying")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketTopPaying(
    @Query("mode") mode = "remote",
    @Query("classification") classification = "market",
    @Query("regionType") regionType = "",
    @Query("region") region = "",
  ): Promise<ResponseWithOptionalData<JobMarketTopPayingData>> {
    this.logger.log(
      `/search/market/top-paying?mode=${mode}&classification=${classification}&regionType=${regionType}&region=${region}`,
    );
    return this.searchService.getMarketTopPaying(
      mode,
      classification,
      regionType,
      region,
    );
  }

  @Get("skills")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketSkills(
    @Query("mode") mode = "remote",
    @Query("sort") sort = "breakout",
    @Query("q") query = "",
    @Query("classification") classification = "market",
  ): Promise<ResponseWithOptionalData<JobMarketSkillListData>> {
    this.logger.log(
      `/search/market/skills?mode=${mode}&sort=${sort}&q=${query}&classification=${classification}`,
    );
    return this.searchService.getMarketSkills(
      mode,
      sort,
      query,
      classification,
    );
  }

  @Get("skills/:slug")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketSkillDetail(
    @Param("slug") slug: string,
    @Query("range") range = "max",
  ): Promise<ResponseWithOptionalData<JobMarketSkillDetailData>> {
    this.logger.log(`/search/market/skills/${slug}?range=${range}`);
    return this.searchService.getMarketSkillDetail(slug, range);
  }

  @Get("pillars/:slug")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getPillarMarket(
    @Param("slug") slug: string,
    @Query("range") range = "365",
  ): Promise<ResponseWithOptionalData<PillarMarketData>> {
    this.logger.log(`/search/market/pillars/${slug}?range=${range}`);
    return this.searchService.getPillarMarket(slug, range);
  }
}
