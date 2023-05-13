import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import {
  JobFilterConfigs,
  OldJobListResult,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ValidationError,
} from "src/shared/types";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { JobListParams } from "./dto/job-list.input";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/presets/cache-control";

@Controller("jobs")
@ApiExtraModels(
  PaginatedData,
  OldJobListResult,
  JobFilterConfigs,
  ValidationError,
)
export class JobsController {
  logger = new CustomLogger(JobsController.name);
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of jobs that satisfy the search and filter predicate",
    type: PaginatedData<OldJobListResult>,
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
              items: { $ref: getSchemaPath(OldJobListResult) },
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
  async getJobsListWithSearch(
    @Query(new ValidationPipe({ transform: true }))
    params: JobListParams,
  ): Promise<PaginatedData<OldJobListResult>> {
    this.logger.log(`/jobs/list ${JSON.stringify(params)}`);
    return this.jobsService.getJobsListWithSearch(params).then(res => {
      if (res === undefined) {
        return {
          page: -1,
          count: 0,
          total: 0,
          data: [],
        };
      } else {
        return res;
      }
    });
  }

  @Get("/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
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
  async getFilterConfigs(): Promise<JobFilterConfigs> {
    this.logger.log(`/jobs/filters`);
    return this.jobsService.getFilterConfigs();
  }

  @Get("details/:uuid")
  @ApiOkResponse({
    description: "Returns the job details for the provided slug",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(OldJobListResult),
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
      "Returns that no job details were found for the specified uuid",
    type: ResponseWithNoData,
  })
  async getJobDetailsByUuid(
    @Param("uuid") uuid: string,
  ): Promise<OldJobListResult | undefined> {
    this.logger.log(`/jobs/details/${uuid}`);
    return this.jobsService.getJobDetailsByUuid(uuid);
  }

  @Get("/org/:uuid")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of jobs posted by an org",
    type: Response<OldJobListResult[]>,
    schema: {
      allOf: [
        {
          type: "array",
          items: { $ref: getSchemaPath(OldJobListResult) },
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
  async getOrgJobsList(
    @Param("uuid") uuid: string,
  ): Promise<OldJobListResult[]> {
    this.logger.log(`/jobs/org/${uuid}`);
    return this.jobsService.getJobsByOrgUuid(uuid);
  }
}
