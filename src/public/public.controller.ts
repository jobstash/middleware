import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { PublicService } from "./public.service";
import { ApiKeyGuard } from "src/auth/api-key.guard";
import { ApiBearerAuth, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { JobListResult, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AllJobsInput } from "./dto/all-jobs.input";

@ApiBearerAuth()
@Controller("public")
export class PublicController {
  logger = new CustomLogger(PublicController.name);
  constructor(private readonly publicService: PublicService) {}

  @Get("/all-jobs")
  @UseGuards(ApiKeyGuard)
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
    return this.publicService.getAllJobsList(params);
  }
}
