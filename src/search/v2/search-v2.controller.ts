import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import { SearchService } from "../search.service";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CACHE_DURATION_15_MINUTES,
  CACHE_DURATION_1_HOUR,
} from "src/shared/constants";
import { ResponseWithOptionalData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { SitemapJob } from "../dto/pillar-page.output";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import {
  JobMarketOverviewData,
  JobMarketSkillDetailData,
  JobMarketSkillListData,
  JobMarketStateData,
  PillarMarketData,
} from "../dto/job-market.output";

@Controller("v2/search")
export class SearchV2Controller {
  private readonly logger = new CustomLogger(SearchV2Controller.name);
  constructor(private readonly searchService: SearchService) {}

  @Get("market/overview")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketOverview(): Promise<
    ResponseWithOptionalData<JobMarketOverviewData>
  > {
    this.logger.log("/v2/search/market/overview");
    return this.searchService.getMarketOverview();
  }

  @Get("market/state")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketState(
    @Query("range") range = "max",
    @Query("classification") classification = "market",
  ): Promise<ResponseWithOptionalData<JobMarketStateData>> {
    this.logger.log(
      `/v2/search/market/state?range=${range}&classification=${classification}`,
    );
    return this.searchService.getMarketState(range, classification);
  }

  @Get("market/skills")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketSkills(
    @Query("mode") mode = "remote",
    @Query("sort") sort = "breakout",
    @Query("q") query = "",
    @Query("classification") classification = "market",
  ): Promise<ResponseWithOptionalData<JobMarketSkillListData>> {
    this.logger.log(
      `/v2/search/market/skills?mode=${mode}&sort=${sort}&q=${query}&classification=${classification}`,
    );
    return this.searchService.getMarketSkills(
      mode,
      sort,
      query,
      classification,
    );
  }

  @Get("market/skills/:slug")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getMarketSkillDetail(
    @Param("slug") slug: string,
    @Query("range") range = "max",
  ): Promise<ResponseWithOptionalData<JobMarketSkillDetailData>> {
    this.logger.log(`/v2/search/market/skills/${slug}?range=${range}`);
    return this.searchService.getMarketSkillDetail(slug, range);
  }

  @Get("market/pillars/:slug")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getPillarMarket(
    @Param("slug") slug: string,
    @Query("range") range = "365",
  ): Promise<ResponseWithOptionalData<PillarMarketData>> {
    this.logger.log(`/v2/search/market/pillars/${slug}?range=${range}`);
    return this.searchService.getPillarMarket(slug, range);
  }

  @Get("pillar/slugs")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_15_MINUTES))
  async searchPillarSlugs(): Promise<string[]> {
    this.logger.log("/v2/search/pillar/slugs");
    return this.searchService.searchJobPillarSlugs();
  }

  @Get("sitemap/pillars")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async searchSitemapPillars(): Promise<{
    data: { slug: string; lastModified: string; jobCount: number }[];
  }> {
    this.logger.log("/v2/search/sitemap/pillars");
    const data = await this.searchService.searchPillarSitemapSlugs();
    return { data };
  }

  @Get("sitemap/jobs")
  @ApiOperation({
    summary: "Get all active jobs for sitemap generation",
    description:
      "Returns minimal job data (shortUUID, title, organizationName, timestamp) for all active/published jobs. Optimized for sitemap XML generation.",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getSitemapJobs(): Promise<ResponseWithOptionalData<SitemapJob[]>> {
    this.logger.log("/v2/search/sitemap/jobs");
    return this.searchService.getSitemapJobs();
  }
}
