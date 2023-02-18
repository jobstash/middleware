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
import { ApiBadRequestResponse, ApiOkResponse } from "@nestjs/swagger";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of jobs that satisfy the filter predicate",
    type: PaginatedData<JobListResult>,
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
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
    type: "",
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
