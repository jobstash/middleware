import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  ValidationPipe,
} from "@nestjs/common";
import { Response as ExpressResponse } from "express";
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
import { responseSchemaWrapper } from "src/shared/helpers";
import { SearchJobsListParams } from "./dto/search-jobs.input";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Controller("jobs")
@ApiExtraModels(PaginatedData, JobListResult, JobFilterConfigs, ValidationError)
export class JobsController {
  logger = new CustomLogger(JobsController.name);
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
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
    params: SearchJobsListParams,
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/jobs/list ${JSON.stringify(params)}`);
    return this.jobsService.getJobsListWithSearch(params);
  }

  @Get("/filters")
  @ApiOkResponse({
    description: "Returns the configuration data for the ui filters",
    schema: {
      allOf: [
        responseSchemaWrapper({
          $ref: getSchemaPath(JobFilterConfigs),
        }),
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  async getFilterConfigs(): Promise<Response<JobFilterConfigs>> {
    this.logger.log(`/jobs/filters`);
    return {
      success: true,
      message: "Retrieved job filter configs successfully",
      data: await this.jobsService.getFilterConfigs(),
    };
  }

  @Get("details/:uuid")
  @ApiOkResponse({
    description: "Returns the job details for the provided slug",
    schema: {
      allOf: [
        responseSchemaWrapper({
          $ref: getSchemaPath(JobListResult),
        }),
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
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<JobListResult> | ResponseWithNoData> {
    this.logger.log(`/jobs/details/${uuid}`);
    const jobDetails = await this.jobsService.getJobDetailsByUuid(uuid);

    if (jobDetails) {
      return {
        success: true,
        message: "Retrieved job details successfully",
        data: jobDetails,
      };
    } else {
      res.status(HttpStatus.NOT_FOUND);
      return {
        success: false,
        message: "Could not find job with uuid " + uuid,
      };
    }
  }

  @Get("/org/:uuid")
  @ApiOkResponse({
    description: "Returns a list of jobs posted by an org",
    type: Response<JobListResult[]>,
    schema: {
      allOf: [
        responseSchemaWrapper({
          type: "array",
          items: { $ref: getSchemaPath(JobListResult) },
        }),
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
  ): Promise<Response<JobListResult[]>> {
    this.logger.log(`/jobs/org/${uuid}`);
    return {
      success: true,
      message: "Retrieved all jobs for org successfully",
      data: await this.jobsService.getJobsByOrgUuid(uuid),
    };
  }
}
