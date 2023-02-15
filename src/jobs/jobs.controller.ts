import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt/jwt-auth.guard";
import { JobsService } from "./jobs.service";
import { JobListResult } from "src/shared/types";
import { JobListParams } from "./dto/job-list.dto";
import { ApiBadRequestResponse, ApiOkResponse } from "@nestjs/swagger";
import { PaginatedData } from "src/shared/interfaces/paginated-data.interface";

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
  @ApiBadRequestResponse()
  async findAll(
    @Query(new ValidationPipe({ transform: true })) params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    return this.jobsService.findAll(params);
  }
}
