import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import {
  JobFilterConfigs,
  JobListResult,
  PaginatedData,
  ValidationError,
} from "src/shared/types";
import { JobListParams } from "./dto/job-list.dto";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";

@Controller("jobs")
@ApiExtraModels(PaginatedData, JobListResult, JobFilterConfigs, ValidationError)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of jobs that satisfy the filter predicate",
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
  async getJobsList(
    @Query(new ValidationPipe({ transform: true })) params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    return this.jobsService.getJobsList(params);
  }

  @Get("/filters")
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
    return this.jobsService.getFilterConfigs();
  }

  @Get("/:uuid")
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
  async getJobDetailsByUuid(
    @Param("uuid") uuid: string,
  ): Promise<JobListResult> {
    // return a 404 if the job details could not be found, otherwise return the job details

    const jobDetails = await this.jobsService.getJobDetailsByUuid(uuid);

    if (jobDetails) {
      return jobDetails;
    }

    // If not found, return a 404
    throw new NotFoundException(`Job with uuid ${uuid} not found`);
  }
}
