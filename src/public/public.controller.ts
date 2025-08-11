import {
  Controller,
  Get,
  Headers,
  Query,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { PublicService } from "./public.service";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  JobFilterConfigs,
  JobListResult,
  PaginatedData,
  ValidationError,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CACHE_DURATION_1_HOUR, ECOSYSTEM_HEADER } from "src/shared/constants";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { ApiKeyGuard } from "src/auth/api-key.guard";

@Controller("public")
export class PublicController {
  private readonly logger = new CustomLogger(PublicController.name);
  constructor(private readonly publicService: PublicService) {}

  @Get("jobs")
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiOkResponse({
    description: "Returns a paginated list of all active jobs ",
    type: PaginatedData<JobListResult>,
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
              items: { $ref: getSchemaPath(JobListResult) },
            },
          },
        },
      ],
    },
  })
  async getAllJobs(
    @Query(new ValidationPipe({ transform: true }))
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/public/jobs ${JSON.stringify(params)}`);
    return await this.publicService.getAllJobsList(params, true);
  }

  @Get("jobs/list")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiOkResponse({
    description: "Returns a paginated list of all active jobs ",
    type: PaginatedData<JobListResult>,
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
              items: { $ref: getSchemaPath(JobListResult) },
            },
          },
        },
      ],
    },
  })
  async getAllJobsList(
    @Query(new ValidationPipe({ transform: true }))
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/public/jobs/list ${JSON.stringify(params)}`);
    return await this.publicService.getAllJobsList(params, false);
  }

  @Get("jobs/filters")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiOkResponse({
    description: "Returns the configuration data for the ui filters",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(JobFilterConfigs),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  async getAllJobsListFilterConfigs(
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<JobFilterConfigs> {
    this.logger.log(`/public/jobs/filters`);
    return this.publicService.getAllJobsFilterConfigs(ecosystem);
  }
}
