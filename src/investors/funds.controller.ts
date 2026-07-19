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
import { FundListItem, InvestorsService } from "./investors.service";

@Controller("funds")
export class FundsController {
  constructor(private readonly investorsService: InvestorsService) {}

  @Get("list")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  getFunds(
    @Query(new ValidationPipe({ transform: true })) params: InvestorListParams,
  ): Promise<PaginatedData<FundListItem>> {
    return this.investorsService.getFundList(
      params.page ?? 1,
      params.limit ?? 20,
    );
  }

  @Get("details/slug/:slug")
  async getFund(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<FundListItem | undefined> {
    const fund = await this.investorsService.getFundDetailsBySlug(slug);
    if (!fund) response.status(HttpStatus.NOT_FOUND);
    return fund;
  }
}
