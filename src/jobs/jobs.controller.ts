import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
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
import { PBACGuard } from "src/auth/pbac.guard";
import { ProfileService } from "src/auth/profile/profile.service";
import { CheckWalletPermissions, COMMUNITY_HEADER } from "src/shared/constants";
import { CACHE_DURATION } from "src/shared/constants/cache-control";
import { Session } from "src/shared/decorators";
import { Permissions } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  AllJobsListResult,
  AllOrgJobsListResult,
  data,
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
import { CacheInterceptor } from "@nestjs/cache-manager";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";

@Controller("jobs")
@UseInterceptors(CacheInterceptor)
@ApiExtraModels(PaginatedData, JobFilterConfigs, ValidationError, JobListResult)
export class JobsController {
  private readonly logger = new CustomLogger(JobsController.name);
  constructor(
    private readonly jobsService: JobsService,
    private readonly tagsService: TagsService,
    private readonly profileService: ProfileService,
    private readonly userService: UserService,
    private readonly subscriptionService: SubscriptionsService,
  ) {}

  @Get("/list")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
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
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: JobListParams,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<PaginatedData<JobListResult>> {
    const enrichedParams = {
      ...params,
      communities: community
        ? [...(params.communities ?? []), community]
        : params.communities,
    };
    const queryString = JSON.stringify(enrichedParams);
    this.logger.log(`/jobs/list ${queryString}`);
    if (address) {
      await this.profileService.logSearchInteraction(address, queryString);
    }
    return this.jobsService.getJobsListWithSearch(enrichedParams);
  }

  @Get("/filters")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<JobFilterConfigs> {
    this.logger.log(`/jobs/filters`);
    return this.jobsService.getFilterConfigs(community);
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
    @Session() { address }: SessionObject,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<JobDetailsResult | undefined> {
    this.logger.log(`/jobs/details/${uuid}`);
    if (address) {
      await this.profileService.logViewDetailsInteraction(address, uuid);
    }
    const result = await this.jobsService.getJobDetailsByUuid(uuid, community);
    if (result === undefined) {
      throw new NotFoundException({
        success: false,
        message: "Job not found",
      });
    }
    return result;
  }

  @Get("/featured/:orgId")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.SUPER_ADMIN],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
  )
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Param("orgId") orgId: string | null = null,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
    @Session() { address, permissions }: SessionObject,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    this.logger.log(`/jobs/featured`);
    if (permissions.includes(CheckWalletPermissions.SUPER_ADMIN)) {
      if (orgId === "all") {
        return this.jobsService.getFeaturedJobs(community);
      } else {
        return this.jobsService.getFeaturedJobsByOrgId(community, orgId);
      }
    } else {
      const userOrgId =
        await this.userService.findOrgIdByMemberUserWallet(address);
      const subscription = data(
        await this.subscriptionService.getSubscriptionInfo(userOrgId),
      );
      if (subscription.isActive()) {
        if (permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)) {
          return this.jobsService.getFeaturedJobsByOrgId(community, orgId);
        } else {
          if (orgId === null) {
            throw new BadRequestException({
              success: false,
              message: "Must specify orgId",
            });
          } else {
            if (
              (await this.userService.isOrgMember(address, orgId)) ||
              (await this.userService.isOrgOwner(address, orgId))
            ) {
              return this.jobsService.getFeaturedJobsByOrgId(community, orgId);
            } else {
              throw new UnauthorizedException({
                success: false,
                message: "You are not authorized to access this resource",
              });
            }
          }
        }
      } else {
        throw new UnauthorizedException({
          success: false,
          message: "You are not authorized to access this resource",
        });
      }
    }
  }

  @Get("/org/:id")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<JobListResult[]> {
    this.logger.log(`/jobs/org/${id}`);
    return this.jobsService.getJobsByOrgId(id, community);
  }

  @Get("/org/:id/all")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  @ApiOkResponse({
    description: "Returns a list of all jobs posted by an org",
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
  async getOrgAllJobsList(
    @Session() { address, permissions }: SessionObject,
    @Param("id") id: string,
    @Query("page") page: number,
    @Query("limit") limit: number,
  ): Promise<PaginatedData<AllOrgJobsListResult>> {
    const authorized = await this.userService.isOrgMember(address, id);
    if (
      authorized ||
      permissions.includes(CheckWalletPermissions.SUPER_ADMIN)
    ) {
      this.logger.log(`/jobs/org/${id}/all ${JSON.stringify({ page, limit })}`);
      return this.jobsService.getAllJobsByOrgId(id, page, limit);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not allowed to access this resource",
      });
    }
  }

  @Get("/org/:id/applicants")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    this.logger.log(`/jobs/org/${id}/applicants`);
    if (!(await this.userService.isOrgMember(address, id))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.jobsService.getJobsByOrgIdWithApplicants(id, list);
  }

  @Get("/applicants")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
    @Session() { address }: SessionObject,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/bookmarked`);
    return this.jobsService.getUserBookmarkedJobs(address, community);
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
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
    @Session() { address }: SessionObject,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/applied`);
    return this.jobsService.getUserAppliedJobs(address, community);
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
    @Session() { address }: SessionObject,
  ): Promise<Response<JobpostFolder[]> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders`);
    return this.jobsService.getUserJobFolders(address);
  }

  @Get("/folders/:slug")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the details of the job folder with the passed slug",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(Response<JobpostFolder>),
        },
      ],
    },
  })
  async getUserJobFolderBySlug(
    @Session() { address }: SessionObject,
    @Param("slug") slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    this.logger.log(`/jobs/folders/:slug`);
    let res: ResponseWithOptionalData<JobpostFolder>;
    if (address) {
      res = await this.jobsService.getUserJobFolderBySlug(address, slug);
    } else {
      res = await this.jobsService.getPublicJobFolderBySlug(slug);
    }
    if (res.success) {
      return res;
    } else {
      throw new NotFoundException(res);
    }
  }

  @Post("/org/:id/applicants")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
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
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
    @Body() body: UpdateJobApplicantListInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/org/:id/applicants`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.jobsService.updateOrgJobApplicantList(orgId, body);
  }

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
    @Session() { address }: SessionObject,
    @Body() body: CreateJobFolderInput,
  ): Promise<Response<JobpostFolder> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders`);
    return this.jobsService.createUserJobFolder(address, body);
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
    @Session() { address }: SessionObject,
    @Param("id") id: string,
    @Body() body: UpdateJobFolderInput,
  ): Promise<Response<JobpostFolder> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders/:id`);
    const canEditFolder = await this.userService.userAuthorizedForJobFolder(
      address,
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
    @Session() { address }: SessionObject,
    @Param("id") id: string,
  ): Promise<Response<JobpostFolder> | ResponseWithNoData> {
    this.logger.log(`/jobs/folders/:id`);
    const canEditFolder = await this.userService.userAuthorizedForJobFolder(
      address,
      id,
    );
    if (canEditFolder) {
      return this.jobsService.deleteUserJobFolder(id);
    } else {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to perform this action",
      });
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
    @Session() { address }: SessionObject,
    @Body() dto: ChangeJobClassificationInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/change-classification`);
    try {
      return this.jobsService.changeJobClassification(address, dto);
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
  @Permissions(
    [CheckWalletPermissions.SUPER_ADMIN],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
  )
  @ApiOkResponse({
    description: "Make a job featured",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async featureJobpost(
    @Session() { address, permissions }: SessionObject,
    @Body() dto: FeatureJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/feature`);
    try {
      if (permissions.includes(CheckWalletPermissions.SUPER_ADMIN)) {
        return this.jobsService.featureJobpost(dto);
      } else {
        const userOrgId =
          await this.userService.findOrgIdByMemberUserWallet(address);
        const jobOrgId = await this.jobsService.getOrgIdByJobId(dto.shortUUID);
        const subscription = data(
          await this.subscriptionService.getSubscriptionInfo(userOrgId),
        );
        if (subscription?.canAccessService("boostedVacancyMultiplier")) {
          if (permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)) {
            return this.jobsService.featureJobpost(dto);
          } else {
            if (!(userOrgId === jobOrgId)) {
              throw new UnauthorizedException({
                success: false,
                message: "You are not authorized to access this resource",
              });
            } else {
              return this.jobsService.featureJobpost(dto);
            }
          }
        } else {
          throw new UnauthorizedException({
            success: false,
            message: "You are not authorized to access this resource",
          });
        }
      }
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
    @Session() { address }: SessionObject,
    @Body() dto: EditJobTagsInput,
  ): Promise<ResponseWithNoData> {
    try {
      const { tags } = dto;
      const tagsToAdd = [];
      for (const tag of tags) {
        const tagNormalizedName = this.tagsService.normalizeTagName(tag);
        const tagNode =
          await this.tagsService.findByNormalizedName(tagNormalizedName);
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
      return this.jobsService.editJobTags(address, {
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
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
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
    const orgId = await this.userService.findOrgIdByJobShortUUID(shortUUID);
    const authorized = await this.userService.isOrgMember(
      session.address,
      orgId,
    );

    if (
      authorized ||
      session.permissions.includes(CheckWalletPermissions.SUPER_ADMIN)
    ) {
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
      if (res1) {
        return {
          success: true,
          message: "Job metadata updated successfully",
        };
      } else {
        return {
          success: false,
          message: "Error updating job metadata",
        };
      }
    } else {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to perform this action",
      });
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
    @Session() { address }: SessionObject,
    @Body() dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/block`);
    try {
      return this.jobsService.blockJobs(address, dto);
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
    @Session() { address }: SessionObject,
    @Body() dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/jobs/block`);
    try {
      return this.jobsService.unblockJobs(address, dto);
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
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  async promoteJob(
    @Param("uuid") uuid: string,
    @Headers(COMMUNITY_HEADER)
    community: string | undefined,
  ): Promise<
    ResponseWithOptionalData<{
      id: string;
      url: string;
    }>
  > {
    this.logger.log(`/jobs/promote/${uuid}`);
    return await this.jobsService.getJobPromotionPaymentUrl(uuid, community);
  }
}
