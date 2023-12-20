import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
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
  Response,
  StructuredJobpostWithRelations,
} from "src/shared/types";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { JobListParams } from "./dto/job-list.input";
import { AllJobsParams } from "./dto/all-jobs.input";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/presets/cache-control";
import { btoa, responseSchemaWrapper } from "src/shared/helpers";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { Response as ExpressResponse, Request } from "express";
import { AuthService } from "src/auth/auth.service";
import { ChangeJobClassificationInput } from "./dto/change-classification.input";
import { BlockJobsInput } from "./dto/block-jobs.input";
import { ProfileService } from "src/auth/profile/profile.service";
import { EditJobTagsInput } from "./dto/edit-tags.input";
import { TagsService } from "src/tags/tags.service";
import { UpdateJobMetadataInput } from "./dto/update-job-metadata.input";

@Controller("jobs")
@ApiExtraModels(PaginatedData, JobFilterConfigs, ValidationError, JobListResult)
export class JobsController {
  private readonly logger = new CustomLogger(JobsController.name);
  constructor(
    private readonly jobsService: JobsService,
    private readonly authService: AuthService,
    private readonly tagsService: TagsService,
    private readonly profileService: ProfileService,
  ) {}

  @Get("/list")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ANON)
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Query(new ValidationPipe({ transform: true }))
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    const paramsParsed = {
      ...params,
      query: btoa(params.query),
    };
    const queryString = JSON.stringify(paramsParsed);
    this.logger.log(`/jobs/list ${queryString}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      await this.profileService.logSearchInteraction(
        address as string,
        queryString,
      );
    }
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ANON)
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<JobListResult | undefined> {
    this.logger.log(`/jobs/details/${uuid}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      await this.profileService.logViewDetailsInteraction(
        address as string,
        uuid,
      );
    }
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description:
      "Returns a paginated, sorted list of all jobs that satisfy the search and filter predicate",
    type: Response<Array<AllJobsListResult>>,
    schema: {
      allOf: [{ $ref: getSchemaPath(AllJobsListResult) }],
    },
  })
  async getAllJobsWithSearch(
    @Query(new ValidationPipe({ transform: true }))
    params: AllJobsParams,
  ): Promise<Response<AllJobsListResult[]>> {
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

  @Get("/bookmarked")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the skills of the currently logged in user",
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
  async getUserBookmarkedJobs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/bookmarked`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.jobsService.getUserBookmarkedJobs(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("/change-classification")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Changes the classification of a list of jobs",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async changeClassification(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() dto: ChangeJobClassificationInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/change-classification`);
    try {
      const { address } = await this.authService.getSession(req, res);
      return this.jobsService.changeJobClassification(address as string, dto);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "jobs.controller",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsController::changeClassification ${err.message}`);
      return {
        success: false,
        message: `Failed to change job classification`,
      };
    }
  }

  @Post("/edit-tags")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Edits the tags of a job",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async editTags(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() dto: EditJobTagsInput,
  ): Promise<ResponseWithNoData> {
    try {
      const { address } = await this.authService.getSession(req, res);
      const { tags } = dto;
      const tagsToAdd = [];
      for (const tag of tags) {
        const tagNormalizedName = this.tagsService.normalizeTagName(tag);
        const tagNode = await this.tagsService.findByNormalizedName(
          tagNormalizedName,
        );
        if (tagNode === null) {
          return {
            success: false,
            message: `Tag ${tag} cannot be added to the job because it doen't exist`,
          };
        } else {
          tagsToAdd.push(tagNormalizedName);
        }
      }
      this.logger.log(`/jobs/edit-tags ${JSON.stringify(tagsToAdd)}`);
      return this.jobsService.editJobTags(address as string, {
        ...dto,
        tags: tagsToAdd,
      });
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "jobs.controller",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsController::editJobTags ${err.message}`);
      return {
        success: false,
        message: `Failed to edit job tags`,
      };
    }
  }

  @Post("/update/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates an existing project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(StructuredJobpostWithRelations),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the job on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateJobMetadata(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Param("id") shortUUID: string,
    @Body(new ValidationPipe({ transform: true })) body: UpdateJobMetadataInput,
  ): Promise<Response<JobListResult> | ResponseWithNoData> {
    this.logger.log(`/jobs/update/${shortUUID} ${JSON.stringify(body)}`);
    const { address } = await this.authService.getSession(req, res);
    const {
      commitment,
      classification,
      locationType,
      project,
      isBlocked,
      isOnline,
      tags,
      ...dto
    } = body;

    if (isBlocked) {
      const res1a = await this.jobsService.blockJobs(address as string, {
        shortUUIDs: [shortUUID],
      });
      if (res1a.success === false) {
        this.logger.error(res1a.message);
        return res1a;
      }
    } else {
      const res1a = await this.jobsService.unblockJobs(address as string, {
        shortUUIDs: [shortUUID],
      });
      if (res1a.success === false) {
        this.logger.error(res1a.message);
        return res1a;
      }
    }

    if (isOnline) {
      const res1b = await this.jobsService.makeJobsOnline(address as string, {
        shortUUIDs: [shortUUID],
      });
      if (res1b.success === false) {
        this.logger.error(res1b.message);
        return res1b;
      }
    } else {
      const res1b = await this.jobsService.makeJobsOffline(address as string, {
        shortUUIDs: [shortUUID],
      });
      if (res1b.success === false) {
        this.logger.error(res1b.message);
        return res1b;
      }
    }

    const res2 = await this.jobsService.changeJobCommitment(address as string, {
      shortUUID,
      commitment,
    });
    if (res2.success === false) {
      this.logger.error(res2.message);
      return res2;
    }

    const res3 = await this.jobsService.changeJobClassification(
      address as string,
      {
        shortUUIDs: [shortUUID],
        classification,
      },
    );
    if (res3.success === false) {
      this.logger.error(res3.message);
      return res3;
    }

    const res4 = await this.jobsService.changeJobLocationType(
      address as string,
      {
        shortUUID,
        locationType,
      },
    );
    if (res4.success === false) {
      this.logger.error(res4.message);
      return res4;
    }

    if (project !== null) {
      const res5 = await this.jobsService.changeJobProject(address as string, {
        shortUUID,
        projectId: project,
      });
      if (res5.success === false) {
        this.logger.error(res5.message);
        return res5;
      }
    }

    const res6 = await this.editTags(req, res, { shortUUID, tags });
    if (res6.success === false) {
      this.logger.error(res6.message);
      return res6;
    }

    const res1 = await this.jobsService.update(shortUUID, dto);
    if (res1 !== undefined) {
      return {
        success: true,
        message: "Job metadata updated successfully",
        data: res1,
      };
    } else {
      return {
        success: false,
        message: "Error updating job metadata",
      };
    }
  }

  @Post("/block")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Blocks a list of jobs",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async blockJobs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/block`);
    try {
      const { address } = await this.authService.getSession(req, res);
      return this.jobsService.blockJobs(address as string, dto);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "jobs.controller",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsController::blockJobs ${err.message}`);
      return {
        success: false,
        message: `Failed to block jobs`,
      };
    }
  }

  @Post("/unblock")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Unblocks a list of jobs",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async unblockJobs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/block`);
    try {
      const { address } = await this.authService.getSession(req, res);
      return this.jobsService.unblockJobs(address as string, dto);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "jobs.controller",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsController::unblockJobs ${err.message}`);
      return {
        success: false,
        message: `Failed to unblock jobs`,
      };
    }
  }
}
