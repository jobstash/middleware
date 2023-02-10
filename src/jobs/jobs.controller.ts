import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt/jwt-auth.guard";
import { JobsService } from "./jobs.service";
import { StructuredJobpost } from "src/shared/types";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("/")
  @UseGuards(JwtAuthGuard)
  async findAll(): Promise<StructuredJobpost[]> {
    return this.jobsService
      .findAll()
      .then(jobs => jobs.map(job => job.getProperties()));
  }
}
