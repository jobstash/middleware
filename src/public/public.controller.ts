import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { PublicService } from "./public.service";
import { ApiKeyGuard } from "src/auth/api-key.guard";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { JobListResult, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AllJobsInput } from "./dto/all-jobs.input";
import { ConfigService } from "@nestjs/config";

@Controller("public")
export class PublicController {
  private readonly logger = new CustomLogger(PublicController.name);
  constructor(
    private readonly publicService: PublicService,
    private readonly configService: ConfigService,
  ) {}

  @Get("/all-jobs")
  @ApiOkResponse({
    description: "Returns a paginated list of all active jobs ",
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
  async getAllJobs(
    @Query(new ValidationPipe({ transform: true }))
    params: AllJobsInput,
  ): Promise<PaginatedData<JobListResult>> {
    this.logger.log(`/public/all-jobs ${JSON.stringify(params)}`);
    const jobs = await this.publicService.getAllJobsList(params);
    return {
      ...jobs,
      data: jobs.data.map(job => ({
        ...job,
        url: `${this.configService.getOrThrow<string>("MW_DOMAIN")}/jobs/${
          job.shortUUID
        }/details`,
      })),
    };
  }
}
