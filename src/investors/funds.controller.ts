import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { Response as ExpressResponse } from "express";
import { CACHE_DURATION_1_HOUR } from "src/shared/constants";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { PaginatedData } from "src/shared/interfaces";
import { InvestorListParams } from "./dto/investor-list.input";
import {
  FundDetails,
  FundListItem,
  FundRoundStage,
  FundSector,
  InvestorsService,
} from "./investors.service";

@Controller("funds")
export class FundsController {
  constructor(private readonly investorsService: InvestorsService) {}

  @Get("list")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getFunds(
    @Query(new ValidationPipe({ transform: true })) params: InvestorListParams,
  ): Promise<PaginatedData<FundListItem>> {
    return this.investorsService.getFundList(params);
  }

  @Get("sectors")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getFundSectors(
    @Query(new ValidationPipe({ transform: true })) params: InvestorListParams,
  ): Promise<FundSector[]> {
    return this.investorsService.getFundSectors(params);
  }

  @Get("rounds")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getFundRoundStages(
    @Query(new ValidationPipe({ transform: true })) params: InvestorListParams,
  ): Promise<FundRoundStage[]> {
    return this.investorsService.getFundRoundStages(params);
  }

  @Get("details/slug/:slug")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getFund(
    @Param("slug") slug: string,
    @Query(new ValidationPipe({ transform: true })) params: InvestorListParams,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<FundDetails | undefined> {
    const fund = await this.investorsService.getFundDetailsBySlug(slug, params);
    if (!fund) response.status(HttpStatus.NOT_FOUND);
    return fund;
  }
}
