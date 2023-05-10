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
  JobListResult,
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
import { CACHE_CONTROL_HEADER } from "src/shared/presets/cache-control";

@Controller("jobs")
@ApiExtraModels(PaginatedData, JobListResult, JobFilterConfigs, ValidationError)
export class JobsController {
  logger = new CustomLogger(JobsController.name);
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
  @Header("Cache-Control", CACHE_CONTROL_HEADER)
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of jobs that satisfy the search and filter predicate",
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
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/jobs/list ${JSON.stringify(params)}`);
    return this.jobsService.getJobsListWithSearch(params);
  }

  @Get("/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER)
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
          $ref: getSchemaPath(JobListResult),
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
  ): Promise<JobListResult | undefined> {
    this.logger.log(`/jobs/details/${uuid}`);
    return this.jobsService.getJobDetailsByUuid(uuid);
  }

  @Get("/org/:uuid")
  @Header("Cache-Control", CACHE_CONTROL_HEADER)
  @ApiOkResponse({
    description: "Returns a list of jobs posted by an org",
    type: Response<JobListResult[]>,
    schema: {
      allOf: [
        {
          type: "array",
          items: { $ref: getSchemaPath(JobListResult) },
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
  async getOrgJobsList(@Param("uuid") uuid: string): Promise<JobListResult[]> {
    this.logger.log(`/jobs/org/${uuid}`);
    return this.jobsService.getJobsByOrgUuid(uuid);
  }
}
