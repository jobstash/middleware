import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt/jwt-auth.guard";
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
  ApiHeader,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";

@ApiHeader({
  name: "Authorization",
  example: "Bearer <token>",
  description: "Bearer token obtained from login",
})
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
  async findAll(
    @Query(new ValidationPipe({ transform: true })) params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    return this.jobsService.findAll(params);
  }

  @Get("/filters")
  @UseGuards(JwtAuthGuard)
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
}
