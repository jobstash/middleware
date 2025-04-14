import {
  Controller,
  Get,
  Headers,
  Query,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { PublicService } from "./public.service";
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  JobFilterConfigs,
  JobListResult,
  PaginatedData,
  SessionObject,
  ValidationError,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CACHE_DURATION, COMMUNITY_HEADER } from "src/shared/constants";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { Session } from "src/shared/decorators";

@Controller("public")
export class PublicController {
  private readonly logger = new CustomLogger(PublicController.name);
  constructor(private readonly publicService: PublicService) {}

  @Get("/all-jobs")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/public/all-jobs ${JSON.stringify(params)}`);
    return await this.publicService.getAllJobsList(params, !!address);
  }

  @Get("/all-jobs/filters")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<JobFilterConfigs> {
    this.logger.log(`/public/all-jobs/filters`);
    return this.publicService.getAllJobsFilterConfigs(community);
  }
}
