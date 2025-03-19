import {
  Controller,
  Get,
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
  AllJobsFilterConfigs,
  JobListResult,
  PaginatedData,
  ValidationError,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AllJobsInput } from "./dto/all-jobs.input";
import { ConfigService } from "@nestjs/config";
import { CACHE_DURATION } from "src/shared/constants";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("public")
export class PublicController {
  private readonly logger = new CustomLogger(PublicController.name);
  constructor(
    private readonly publicService: PublicService,
    private readonly configService: ConfigService,
  ) {}

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
    @Query(new ValidationPipe({ transform: true }))
    params: AllJobsInput,
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/public/all-jobs ${JSON.stringify(params)}`);
    const jobs = await this.publicService.getAllJobsList(params);
    return {
      ...jobs,
      data: jobs.data.map(job => ({
        ...job,
        url: `${this.configService.getOrThrow<string>("FE_DOMAIN")}/jobs/${
          job.shortUUID
        }/details`,
      })),
    };
  }

  @Get("/all-jobs/filters")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns the configuration data for the ui filters",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(AllJobsFilterConfigs),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  async getAllJobsListFilterConfigs(): Promise<AllJobsFilterConfigs> {
    this.logger.log(`/public/all-jobs/filters`);
    return this.publicService.getAllJobsFilterConfigs();
  }
}
