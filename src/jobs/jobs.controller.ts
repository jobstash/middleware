import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import * as Sentry from "@sentry/node";
import { Response as ExpressResponse, Request } from "express";
import { AuthService } from "src/auth/auth.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { ProfileService } from "src/auth/profile/profile.service";
import { CheckWalletPermissions, ECOSYSTEM_HEADER } from "src/shared/constants";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/constants/cache-control";
import { Session } from "src/shared/decorators";
import { Permissions } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  AllJobsListResult,
  JobApplicant,
  JobDetailsResult,
  JobFilterConfigs,
  JobListResult,
  JobpostFolder,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
  StructuredJobpostWithRelations,
  ValidationError,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { TagsService } from "src/tags/tags.service";
import { UserService } from "src/user/user.service";
import { AllJobsParams } from "./dto/all-jobs.input";
import { BlockJobsInput } from "./dto/block-jobs.input";
import { ChangeJobClassificationInput } from "./dto/change-classification.input";
import { CreateJobFolderInput } from "./dto/create-job-folder.input";
import { EditJobTagsInput } from "./dto/edit-tags.input";
import { FeatureJobsInput } from "./dto/feature-jobs.input";
import { JobListParams } from "./dto/job-list.input";
import { UpdateJobApplicantListInput } from "./dto/update-job-applicant-list.input";
import { UpdateJobFolderInput } from "./dto/update-job-folder.input";
import { UpdateJobMetadataInput } from "./dto/update-job-metadata.input";
import { JobsService } from "./jobs.service";

@Controller("jobs")
@ApiExtraModels(PaginatedData, JobFilterConfigs, ValidationError, JobListResult)
export class JobsController {
  private readonly logger = new CustomLogger(JobsController.name);
  constructor(
    private readonly jobsService: JobsService,
    private readonly authService: AuthService,
    private readonly tagsService: TagsService,
    private readonly profileService: ProfileService,
    private readonly userService: UserService,
  ) {}

  @Get("/list")
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
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
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<PaginatedData<JobListResult>> {
    const enrichedParams = {
      ...params,
      communities: ecosystem
        ? [...(params.communities ?? []), ecosystem]
        : params.communities,
    };
    const queryString = JSON.stringify(enrichedParams);
    this.logger.log(`/jobs/list ${queryString}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      await this.profileService.logSearchInteraction(address, queryString);
    }
    return this.jobsService.getJobsListWithSearch(enrichedParams);
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
  async getFilterConfigs(
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<JobFilterConfigs> {
    this.logger.log(`/jobs/filters`);
    return this.jobsService.getFilterConfigs(ecosystem);
  }

  @Get("details/:uuid")
  @UseGuards(PBACGuard)
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
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<JobDetailsResult | undefined> {
    this.logger.log(`/jobs/details/${uuid}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      await this.profileService.logViewDetailsInteraction(address, uuid);
    }
    const result = await this.jobsService.getJobDetailsByUuid(uuid, ecosystem);
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("/featured")
  @UseGuards(PBACGuard)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of featured jobs",
    type: Response<JobListResult[]>,
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
  async getFeaturedJobsList(
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    this.logger.log(`/jobs/featured`);
    return this.jobsService.getFeaturedJobs(ecosystem);
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
  async getOrgJobsList(
    @Param("id") id: string,
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<JobListResult[]> {
    this.logger.log(`/jobs/org/${id}`);
    return this.jobsService.getJobsByOrgId(id, ecosystem);
  }

  @Get("/org/:id/applicants")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ORG_AFFILIATE)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description:
      "Returns a list of jobs posted by an org with corresponding applicants",
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
  async getOrgJobApplicantList(
    @Param("id") id: string,
    @Query("list")
    list:
      | "all"
      | "shortlisted"
      | "archived"
      | "new"
      | "interviewing"
      | "hired" = "all",
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    this.logger.log(`/jobs/org/${id}/applicants`);
    const { address } = await this.authService.getSession(req, res);
    if (!(await this.userService.userAuthorizedForOrg(address, id))) {
      res.status(HttpStatus.UNAUTHORIZED);
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }
    return this.jobsService.getJobsByOrgIdWithApplicants(id, list);
  }

  @Get("/applicants")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of applicants alongside relevant information",
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
  async getJobApplicantList(
    @Query("list")
    list:
      | "all"
      | "shortlisted"
      | "archived"
      | "new"
      | "interviewing"
      | "hired" = "all",
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    this.logger.log(`/jobs/applicants`);
    return this.jobsService.getJobApplicants(list);
  }

  @Get("/all")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
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
    this.logger.log(`/jobs/all ${JSON.stringify(params)}`);
    return this.jobsService.getAllJobsWithSearch(params);
  }

  @Get("/all/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Returns the configuration data for the ui filters",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(AllJobsFilterConfigs),
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the bookmarked jobs of the currently logged in user",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobListResult[]>),
        },
      ],
    },
  })
  async getUserBookmarkedJobs(
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
    @Session() session: SessionObject,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/bookmarked`);
    return this.jobsService.getUserBookmarkedJobs(session.address, ecosystem);
  }

  @Get("/applied")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the applied jobs of the currently logged in user",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobListResult[]>),
        },
      ],
    },
  })
  async getUserAppliedJobs(
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
    @Session() session: SessionObject,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/applied`);
    return this.jobsService.getUserAppliedJobs(session.address, ecosystem);
  }

  @Get("/folders")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the job folders of the currently logged in user",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobpostFolder[]>),
        },
      ],
    },
  })
  async getUserJobFolders(
    @Session() session: SessionObject,
  ): Promise<Response<JobpostFolder[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders`);
    return this.jobsService.getUserJobFolders(session.address);
  }

  @Get("/folders/:id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the details of the job folder with the passed id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobpostFolder>),
        },
      ],
    },
  })
  async getUserJobFolderById(
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    this.logger.log(`/jobs/folders/:id`);
    return this.jobsService.getUserJobFolderById(id);
  }

  @Post("/org/:id/applicants")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ORG_AFFILIATE)
  @ApiOkResponse({
    description: "Updates an orgs applicant list",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ResponseWithNoData),
        },
      ],
    },
  })
  async updateOrgJobApplicantList(
    @Session() session: SessionObject,
    @Param("id") orgId: string,
    @Body() body: UpdateJobApplicantListInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/org/:id/applicants`);
    if (
      !(await this.userService.userAuthorizedForOrg(session.address, orgId))
    ) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.jobsService.updateOrgJobApplicantList(orgId, body);
  }

  // @Post("/applicants")
  // @UseGuards(PBACGuard)
  // @Permissions(CheckWalletPermissions.ORG_AFFILIATE)
  // @ApiOkResponse({
  //   description: "Updates an orgs applicant list",
  //   schema: {
  //     allOf: [
  //       {
  //         $ref: getSchemaPath(ResponseWithNoData),
  //       },
  //     ],
  //   },
  // })
  // async updateJobApplicantList(
  //   @Body() body: UpdateJobApplicantListInput,
  // ): Promise<ResponseWithNoData> {
  //   this.logger.log(`/jobs/applicants`);
  //   return this.jobsService.updateJobApplicantList(body);
  // }

  @Post("/folders")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Creates a new job folder",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobpostFolder>),
        },
      ],
    },
  })
  async createUserJobFolder(
    @Session() session: SessionObject,
    @Body() body: CreateJobFolderInput,
  ): Promise<Response<JobpostFolder> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders`);
    return this.jobsService.createUserJobFolder(session.address, body);
  }

  @Post("/folders/:id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Updates the details of the job folder with the passed id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobpostFolder>),
        },
      ],
    },
  })
  async updateUserJobFolder(
    @Session() session: SessionObject,
    @Param("id") id: string,
    @Body() body: UpdateJobFolderInput,
  ): Promise<Response<JobpostFolder> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders/:id`);
    const canEditFolder = await this.userService.userAuthorizedForJobFolder(
      session.address,
      id,
    );
    if (canEditFolder) {
      return this.jobsService.updateUserJobFolder(id, body);
    } else {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to perform this action",
      });
    }
  }

  @Delete("/folders/:id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Deletes the job folder with the passed id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobpostFolder>),
        },
      ],
    },
  })
  async deleteUserJobFolder(
    @Session() session: SessionObject,
    @Param("id") id: string,
  ): Promise<Response<JobpostFolder> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders/:id`);
    const canEditFolder = await this.userService.userAuthorizedForJobFolder(
      session.address,
      id,
    );
    if (canEditFolder) {
      return this.jobsService.deleteUserJobFolder(id);
    } else {
      return {
        success: false,
        message: "You are not authorized to perform this action",
      };
    }
  }

  @Post("/change-classification")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Changes the classification of a list of jobs",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async changeClassification(
    @Session() session: SessionObject,
    @Body() dto: ChangeJobClassificationInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/change-classification`);
    try {
      return this.jobsService.changeJobClassification(session.address, dto);
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

  @Post("/feature")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Make a job featured",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async makeFeatured(
    @Body() dto: FeatureJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/feature`);
    try {
      return this.jobsService.makeJobFeatured(dto);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "jobs.controller",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsController::makeFeatured ${err.message}`);
      return {
        success: false,
        message: `Failed to make job featured`,
      };
    }
  }

  @Post("/edit-tags")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Edits the tags of a job",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async editTags(
    @Session() session: SessionObject,
    @Body() dto: EditJobTagsInput,
  ): Promise<ResponseWithNoData> {
    try {
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
      return this.jobsService.editJobTags(session.address, {
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Updates an existing job's metadata",
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
    @Session() session: SessionObject,
    @Param("id") shortUUID: string,
    @Body(new ValidationPipe({ transform: true })) body: UpdateJobMetadataInput,
  ): Promise<Response<JobListResult> | ResponseWithNoData> {
    this.logger.log(`/jobs/update/${shortUUID} ${JSON.stringify(body)}`);
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
    const { address } = session;

    if (isBlocked === true) {
      const res1a = await this.jobsService.blockJobs(address, {
        shortUUIDs: [shortUUID],
      });
      if (res1a.success === false) {
        this.logger.error(res1a.message);
        return res1a;
      }
    } else {
      if (isBlocked === false) {
        const res1a = await this.jobsService.unblockJobs(address, {
          shortUUIDs: [shortUUID],
        });
        if (res1a.success === false) {
          this.logger.error(res1a.message);
          return res1a;
        }
      }
    }

    if (isOnline === true) {
      const res1b = await this.jobsService.makeJobsOnline(address, {
        shortUUIDs: [shortUUID],
      });
      if (res1b.success === false) {
        this.logger.error(res1b.message);
        return res1b;
      }
    } else {
      if (isOnline === false) {
        const res1b = await this.jobsService.makeJobsOffline(address, {
          shortUUIDs: [shortUUID],
        });
        if (res1b.success === false) {
          this.logger.error(res1b.message);
          return res1b;
        }
      }
    }

    const res2 = await this.jobsService.changeJobCommitment(address, {
      shortUUID,
      commitment,
    });
    if (res2.success === false) {
      this.logger.error(res2.message);
      return res2;
    }

    const res3 = await this.jobsService.changeJobClassification(address, {
      shortUUIDs: [shortUUID],
      classification,
    });
    if (res3.success === false) {
      this.logger.error(res3.message);
      return res3;
    }

    const res4 = await this.jobsService.changeJobLocationType(address, {
      shortUUID,
      locationType,
    });
    if (res4.success === false) {
      this.logger.error(res4.message);
      return res4;
    }

    if (project) {
      const res5 = await this.jobsService.changeJobProject(address, {
        shortUUID,
        projectId: project,
      });
      if (res5.success === false) {
        this.logger.error(res5.message);
        return res5;
      }
    }

    const res6 = await this.editTags(session, {
      shortUUID,
      tags: tags.map(x => x.name),
    });
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Blocks a list of jobs",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async blockJobs(
    @Session() session: SessionObject,
    @Body() dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/block`);
    try {
      return this.jobsService.blockJobs(session.address, dto);
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Unblocks a list of jobs",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async unblockJobs(
    @Session() session: SessionObject,
    @Body() dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/block`);
    try {
      return this.jobsService.unblockJobs(session.address, dto);
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

  @Get("promote/:uuid")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  async promoteJob(
    @Param("uuid") uuid: string,
    @Headers(ECOSYSTEM_HEADER)
    ecosystem: string | undefined,
  ): Promise<
    ResponseWithOptionalData<{
      id: string;
      url: string;
    }>
  > {
    this.logger.log(`/jobs/promote/${uuid}`);
    return await this.jobsService.getJobPromotionPaymentUrl(uuid, ecosystem);
  }
}
