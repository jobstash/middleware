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
import { InvestorsService } from "./investors.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  ApiOkResponse,
  getSchemaPath,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { CACHE_DURATION_1_HOUR } from "src/shared/constants";
import {
  Investor,
  PaginatedData,
  ResponseWithNoData,
} from "src/shared/interfaces";
import { ValidationError } from "class-validator";
import { InvestorListParams } from "./dto/investor-list.input";
import { Response as ExpressResponse } from "express";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("investors")
export class InvestorsController {
  private readonly logger = new CustomLogger(InvestorsController.name);
  constructor(private readonly investorsService: InvestorsService) {}

  @Get("/list")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiOkResponse({
    description:
      "Returns a sorted list of investors that are present in our dataset",
    type: PaginatedData<Investor>,
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(PaginatedData),
          properties: {
            page: {
              type: "number",
            },
            count: {
              type: "number",
            },
            data: {
              type: "array",
              items: { $ref: getSchemaPath(Investor) },
            },
          },
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ValidationError),
        },
      ],
    },
  })
  async getInvestorList(
    @Query(new ValidationPipe({ transform: true }))
    params: InvestorListParams,
  ): Promise<PaginatedData<Investor>> {
    this.logger.log(`/investors/list ${JSON.stringify(params)}`);
    return this.investorsService.getInvestorList(
      params.page ?? 1,
      params.limit ?? 10,
    );
  }

  @Get("details/slug/:slug")
  @ApiOkResponse({
    description: "Returns the investor details for the provided slug",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Investor),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no investor details were found for the specified slug",
    type: ResponseWithNoData,
  })
  async getInvestorDetailsByUuid(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Investor | undefined> {
    this.logger.log(`/investors/details/slug/${slug}`);
    const result = await this.investorsService.getInvestorDetailsBySlug(slug);

    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
