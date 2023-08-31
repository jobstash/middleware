import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import {
  CheckWalletRoles,
  JobFilterConfigs,
  JobListResult,
  PaginatedData,
  ResponseWithNoData,
  ValidationError,
  AllJobsListResult,
  AllJobsFilterConfigs,
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
import { AllJobsParams } from "./dto/all-jobs.input";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/presets/cache-control";
import { btoa } from "src/shared/helpers";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { Response } from "express";

@Controller("jobs")
@ApiExtraModels(PaginatedData, JobFilterConfigs, ValidationError, JobListResult)
export class JobsController {
  logger = new CustomLogger(JobsController.name);
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
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
    const paramsParsed = {
      ...params,
      query: btoa(params.query),
    };
    this.logger.log(`/jobs/list ${JSON.stringify(paramsParsed)}`);
    return this.jobsService.getJobsListWithSearch(paramsParsed);
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
    @Res({ passthrough: true }) res: Response,
  ): Promise<JobListResult | undefined> {
    this.logger.log(`/jobs/details/${uuid}`);
    const result = await this.jobsService.getJobDetailsByUuid(uuid);
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("/org/:id")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of jobs posted by an org",
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
  async getOrgJobsList(@Param("id") id: string): Promise<JobListResult[]> {
    this.logger.log(`/jobs/org/${id}`);
    return this.jobsService.getJobsByOrgId(id);
  }
  @Get("/all")
  // @UseGuards(RBACGuard)
  // @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description:
      "Returns a paginated, sorted list of all jobs that satisfy the search and filter predicate",
    type: PaginatedData<AllJobsListResult>,
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
              items: { $ref: getSchemaPath(AllJobsListResult) },
            },
          },
        },
      ],
    },
  })
  async getAllJobsWithSearch(
    @Query(new ValidationPipe({ transform: true }))
    params: AllJobsParams,
  ): Promise<PaginatedData<AllJobsListResult>> {
    const paramsParsed = {
      ...params,
      query: btoa(params.query),
    };
    this.logger.log(`/jobs/all ${JSON.stringify(paramsParsed)}`);
    return this.jobsService.getAllJobsWithSearch(paramsParsed);
  }

  @Get("/all/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
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
  async getAllJobsListFilterConfigs(): Promise<AllJobsFilterConfigs> {
    this.logger.log(`/jobs/all/filters`);
    return this.jobsService.getAllJobsFilterConfigs();
  }
}
