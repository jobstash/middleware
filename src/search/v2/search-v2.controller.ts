import {
  Controller,
  Get,
  Headers,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiHeader, ApiOperation } from "@nestjs/swagger";
import { SearchService } from "../search.service";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CACHE_DURATION_15_MINUTES,
  CACHE_DURATION_1_HOUR,
  ECOSYSTEM_HEADER,
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
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getSitemapJobs(
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<SitemapJob[]>> {
    this.logger.log(
      `/v2/search/sitemap/jobs ${JSON.stringify({ ecosystem: ecosystem ?? null })}`,
    );
    return this.searchService.getSitemapJobs(ecosystem);
  }
}
