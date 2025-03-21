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
import { ChainsService } from "./chains.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  ApiOkResponse,
  getSchemaPath,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { CACHE_DURATION } from "src/shared/constants";
import {
  Chain,
  PaginatedData,
  ResponseWithNoData,
} from "src/shared/interfaces";
import { ValidationError } from "class-validator";
import { ChainListParams } from "./dto/chain-list.input";
import { Response as ExpressResponse } from "express";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("chains")
export class ChainsController {
  private readonly logger = new CustomLogger(ChainsController.name);
  constructor(private readonly chainsService: ChainsService) {}

  @Get("/list")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @ApiOkResponse({
    description:
      "Returns a sorted list of chains that are present in our dataset",
    type: PaginatedData<Chain>,
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
              items: { $ref: getSchemaPath(Chain) },
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
  async getChainList(
    @Query(new ValidationPipe({ transform: true }))
    params: ChainListParams,
  ): Promise<PaginatedData<Chain>> {
    this.logger.log(`/chains/list ${JSON.stringify(params)}`);
    return this.chainsService.getChainList(
      params.page ?? 1,
      params.limit ?? 10,
    );
  }

  @Get("details/slug/:slug")
  @ApiOkResponse({
    description: "Returns the chain details for the provided slug",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Chain),
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
      "Returns that no chain details were found for the specified slug",
    type: ResponseWithNoData,
  })
  async getChainDetailsByUuid(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Chain | undefined> {
    this.logger.log(`/chains/details/slug/${slug}`);
    const result = await this.chainsService.getChainDetailsBySlug(slug);

    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
