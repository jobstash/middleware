import {
  Controller,
  Get,
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

@Controller("v2/search")
export class SearchV2Controller {
  private readonly logger = new CustomLogger(SearchV2Controller.name);
  constructor(private readonly searchService: SearchService) {}

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
    data: { slug: string; lastModified: string }[];
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
