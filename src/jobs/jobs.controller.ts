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

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("/list")
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query(new ValidationPipe({ transform: true })) params: JobListParams,
  ): Promise<JobListResult[]> {
    return this.jobsService
      .findAll(params)
      .then(jobs => jobs.map(job => job.getProperties()));
  }
}
