import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import * as Sentry from "@sentry/node";
import axios from "axios";
import { ValidationError } from "class-validator";
import { randomUUID } from "crypto";
import { Response as ExpressResponse } from "express";
import { File, NFTStorage } from "nft.storage";
import { PBACGuard } from "src/auth/pbac.guard";
import { OrganizationsService } from "src/organizations/organizations.service";
import {
  CheckWalletPermissions,
  ECOSYSTEM_HEADER,
  EMPTY_SESSION_OBJECT,
} from "src/shared/constants";
import { CACHE_DURATION_1_HOUR } from "src/shared/constants/cache-control";
import { Permissions, Session } from "src/shared/decorators";
import { nonZeroOrNull, responseSchemaWrapper } from "src/shared/helpers";
import { ProjectProps } from "src/shared/models";
import {
  data,
  DefiLlamaProject,
  DefiLlamaProjectPrefill,
  DexSummary,
  FeeOverview,
  Jobsite,
  OptionsSummary,
  PaginatedData,
  Project,
  ProjectDetailsResult,
  ProjectFilterConfigs,
  ProjectListResult,
  ProjectMoreInfo,
  ProjectMoreInfoEntity,
  ProjectWithRelations,
  RawProjectWebsite,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateProjectMetricsInput } from "./dto/create-project-metrics.input";
import { CreateProjectInput } from "./dto/create-project.input";
import { LinkJobsToProjectInput } from "./dto/link-jobs-to-project.dto";
import { LinkReposToProjectInput } from "./dto/link-repos-to-project.dto";
import { ProjectListParams } from "./dto/project-list.input";
import { UpdateProjectInput } from "./dto/update-project.input";
import { ProjectCategoryService } from "./project-category.service";
import { ProjectsService } from "./projects.service";
import { AddProjectByUrlInput } from "./dto/add-project-by-url.input";
import { ActivateProjectJobsiteInput } from "./dto/activate-project-jobsites.input";
import { CreateProjectJobsiteInput } from "./dto/create-project-jobsites.input";
import { SearchProjectsInput } from "./dto/search-projects.input";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("projects")
@ApiExtraModels(Project)
export class ProjectsController {
  private readonly NFT_STORAGE_API_KEY;
  private readonly nftStorageClient: NFTStorage;
  private readonly logger = new CustomLogger(ProjectsController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectCategoryService: ProjectCategoryService,
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
  ) {
    this.NFT_STORAGE_API_KEY = this.configService.get<string>(
      "NFT_STORAGE_API_KEY",
    );
    this.nftStorageClient = new NFTStorage({
      token: this.NFT_STORAGE_API_KEY,
    });
  }

  @Get("/")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Returns a list of all projects",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjects(
    @Session() { address }: SessionObject,
  ): Promise<
    ResponseWithOptionalData<
      Omit<
        ProjectWithRelations,
        | "hacks"
        | "audits"
        | "chains"
        | "ecosystems"
        | "jobs"
        | "investors"
        | "repos"
        | "ecosystems"
      >[]
    >
  > {
    this.logger.log(`GET /projects from ${address}`);
    return this.projectsService
      .getProjects()
      .then(res => ({
        success: true,
        message: "Retrieved all projects successfully",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "projects.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/projects ${err.message}`);
        return {
          success: false,
          message: `Error retrieving projects!`,
        };
      });
  }

  @Get("/list")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of projects that satisfy the search and filter predicate",
    type: PaginatedData<ProjectWithRelations>,
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
              items: { $ref: getSchemaPath(ProjectListResult) },
            },
          },
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of query params that failed validation",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ValidationError),
        },
      ],
    },
  })
  async getProjectsListWithSearch(
    @Query(new ValidationPipe({ transform: true }))
    params: ProjectListParams,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<PaginatedData<ProjectListResult>> {
    const enrichedParams = {
      ...params,
      ecosystemHeader: ecosystem,
    };
    this.logger.log(`/projects/list ${JSON.stringify(enrichedParams)}`);
    return this.projectsService.getProjectsListWithSearch(enrichedParams);
  }

  @Get("/filters")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @ApiOkResponse({
    description: "Returns the configuration data for the ui filters",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ProjectFilterConfigs),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  async getFilterConfigs(
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<ProjectFilterConfigs> {
    this.logger.log(`/projects/filters`);
    return this.projectsService.getFilterConfigs(ecosystem);
  }

  @Get("id/:domain")
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no project id was found for the specified domain",
    type: ResponseWithNoData,
  })
  async getProjectIdByDomain(
    @Param("domain") domain: string,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/project/id/${domain}`);
    return this.projectsService.findIdByWebsite(domain);
  }

  @Get("details/:id")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @ApiOkResponse({
    description: "Returns the project details for the provided id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ProjectDetailsResult),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no job details were found for the specified uuid",
    type: ResponseWithNoData,
  })
  async getProjectDetailsById(
    @Param("id") id: string,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<ProjectDetailsResult | undefined> {
    this.logger.log(`/projects/details/${id}`);
    const result = await this.projectsService.getProjectDetailsById(
      id,
      ecosystem,
    );
    if (result === undefined) {
      throw new NotFoundException({
        success: false,
        message: "Project not found",
      });
    }
    return result;
  }

  @Get("details/slug/:slug")
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific ecosystem",
  })
  @ApiOkResponse({
    description: "Returns the project details for the provided slug",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ProjectDetailsResult),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no job details were found for the specified uuid",
    type: ResponseWithNoData,
  })
  async getProjectDetailsBySlug(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<ProjectDetailsResult | undefined> {
    this.logger.log(`/projects/details/slug/${slug}`);
    const result = await this.projectsService.getProjectDetailsBySlug(
      slug,
      ecosystem,
    );
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("/category/:category")
  @ApiOkResponse({
    description: "Returns a list of all projects under the specified category",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ProjectWithRelations),
    }),
  })
  async getProjectsByCategory(
    @Param("category") category: string,
  ): Promise<ResponseWithOptionalData<ProjectProps[]>> {
    this.logger.log(`/projects/category/${category}`);
    return this.projectsService
      .getProjectsByCategory(category)
      .then(res => ({
        success: true,
        message: "Retrieved all projects in category successfully",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "projects.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/projects/category/${category} ${err.message}`);
        return {
          success: false,
          message: `Error retrieving projects by category!`,
        };
      });
  }

  @Get("/competitors/:id")
  @ApiOkResponse({
    description:
      "Returns a list of competing projects for the specified project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ProjectWithRelations),
    }),
  })
  async getProjectCompetitors(
    @Param("id") id: string,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<Response<ProjectProps[]> | ResponseWithNoData> {
    this.logger.log(`/projects/competitors/${id}`);
    return this.projectsService
      .getProjectCompetitors(id, ecosystem)
      .then(res => ({
        success: true,
        message: "Retrieved all competing projects successfully",
        data: res ?? [],
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "projects.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/projects/competitors/${id} ${err.message}`);
        return {
          success: false,
          message: `Error retrieving project competitors!`,
        };
      });
  }

  @Get("/all")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Returns a paginated sorted list all projects",
    type: PaginatedData<ProjectWithRelations>,
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
              items: {
                $ref: getSchemaPath(ProjectWithRelations),
                properties: {
                  rawWebsite: {
                    $ref: getSchemaPath(RawProjectWebsite),
                    nullable: true,
                  },
                },
              },
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
  async getAllProjects(
    @Session() { address }: SessionObject,
    @Query("page") page: number,
    @Query("limit") limit: number,
  ): Promise<
    | PaginatedData<
        ProjectWithRelations & { rawWebsite: RawProjectWebsite | null }
      >
    | ResponseWithNoData
  > {
    this.logger.log(`GET /projects/all from ${address}`);
    return this.projectsService
      .getAllProjects(page ?? 1, limit ?? 10)
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "projects.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/projects/all ${err.message}`);
        return {
          success: false,
          message: `Error retrieving all projects!`,
        };
      });
  }

  @Get("/all/:id")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Returns a list of all projects for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Project),
    }),
  })
  async getProjectsByOrgId(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<Project[]>> {
    this.logger.log(`GET /projects/all/${id} from ${address}`);
    return this.projectsService
      .getProjectsByOrgId(id)
      .then(res => ({
        success: true,
        message: "Retrieved all organization projects successfully",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "projects.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/projects/all/${id} ${err.message}`);
        return {
          success: false,
          message: `Error retrieving project for organization!`,
        };
      });
  }

  @Get("/search")
  @UseGuards(PBACGuard)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  @ApiOkResponse({
    description: "Returns a list of projects that match the search criteria",
    type: Response<PaginatedData<ProjectListResult>>,
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  async searchProjects(
    @Query(new ValidationPipe({ transform: true }))
    params: SearchProjectsInput,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<PaginatedData<ProjectListResult>> {
    this.logger.log(`/projects/search ${JSON.stringify({ params })}`);
    return this.projectsService.searchProjects(params, ecosystem);
  }

  @Get("/search/all")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Returns a list of all projects with names matching the query",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ProjectWithRelations),
    }),
  })
  async searchAllProjects(
    @Session() { address }: SessionObject,
    @Query("query") query: string,
  ): Promise<ResponseWithOptionalData<ProjectProps[]>> {
    this.logger.log(`GET /projects/search?query=${query} from ${address}`);
    return this.projectsService
      .searchAllProjects(query)
      .then(res => ({
        success: true,
        message: "Retrieved matching projects successfully",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "projects.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/projects/search?query=${query} ${err.message}`);
        return {
          success: false,
          message: `Error retrieving projects by query!`,
        };
      });
  }

  @Get("prefiller")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description:
      "Returns the details of the project retrieved from the passed defillama url",
  })
  async getProjectDetailsFromDefillama(
    @Session() { address }: SessionObject,
    @Query("url") url: string,
  ): Promise<ResponseWithOptionalData<DefiLlamaProjectPrefill>> {
    this.logger.log(`GET /prefiller?url=${url} from ${address}`);

    try {
      const uri = new URL(url);
      const regex = /^https:\/\/api\.llama\.fi\/protocol\/[^\/]+$/;
      if (regex.test(uri.toString())) {
        const response = await axios.get(uri.toString());
        if (!response) {
          return {
            success: false,
            message: "Unable to retrieve project details",
          };
        } else {
          const projectsData = (
            await axios.get("https://api.llama.fi/protocols")
          ).data as DefiLlamaProject[];
          const dexOverviewData = (
            await axios.get(
              `https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=totalVolume`,
            )
          ).data as DexSummary;
          const optionsOverview = (
            await axios.get(
              `https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyPremiumVolume`,
            )
          ).data as OptionsSummary;
          const dailyFees = (
            await axios.get(
              `https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees`,
            )
          ).data as FeeOverview;
          const dailyRevenue = (
            await axios.get(
              `https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue`,
            )
          ).data as FeeOverview;
          const project = response.data;
          const thisProjectsData = projectsData.find(
            p =>
              p.name === project.name ||
              p.symbol === project.symbol ||
              p.id === project.id,
          );
          const dexOverview = dexOverviewData.protocols.find(
            p => p.name === project.name,
          );
          const optionOverview = optionsOverview.protocols.find(
            p => p.name === project.name,
          );
          const feesOverview = dailyFees.protocols.find(
            p => p.name === project.name,
          );
          const revenueOverview = dailyRevenue.protocols.find(
            p => p.name === project.name,
          );
          return {
            success: true,
            message: "Project details retrieved successfully",
            data: {
              ...new ProjectMoreInfoEntity({
                id: randomUUID(),
                orgIds: [],
                name: project.name,
                logo: project.logo,
                tokenSymbol: project.symbol,
                normalizedName: project.normalizedName,
                tvl: thisProjectsData?.tvl,
                monthlyVolume:
                  (dexOverview?.total30d || 0) +
                  (optionOverview?.total30d || 0),
                monthlyFees: feesOverview?.total30d ?? 0,
                monthlyRevenue: revenueOverview?.total30d ?? 0,
                tokenAddress: thisProjectsData?.address,
                description: project.description,
                summary: project.summary,
              }).getProperties(),
              url: project.url,
            },
          };
        }
      } else {
        return { success: false, message: "Invalid defillama url passed" };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "prefill-data",
          source: "projects.controller",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`/projects/prefiller ${err.message}`);
      return { success: false, message: "Failed to parse url" };
    }
  }

  @Post("/upload-logo")
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN)
  @ApiOkResponse({
    description:
      "Uploads an projects logo and returns the url to the cloud file",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  @ApiInternalServerErrorResponse({
    description: "There was an error uploading the logo",
  })
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipeBuilder().build({
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<string> | ResponseWithNoData> {
    try {
      this.logger.log(
        "/projects/upload-logo Uploading logo to IPFS: ",
        file.originalname,
      );
      const type = file.mimetype;
      const fileForUpload = new File([file.buffer], file.originalname, {
        type,
      });

      const storageResult = await this.nftStorageClient.store({
        image: fileForUpload,
        name: file.originalname,
        description: file.originalname,
      });

      // convert the url returned from an ipfs protocol one to a https one using the ipfs.io gateway
      const httpsUrl = storageResult.url.replace(
        "ipfs://",
        "https://ipfs.io/ipfs/",
      );

      const jsonMetadata = await fetch(httpsUrl);
      const parsedMetadata = await jsonMetadata.json();
      const imageUrl = parsedMetadata.image;

      const httpsImageUrl = imageUrl.replace(
        "ipfs://",
        "https://ipfs.io/ipfs/",
      );

      this.logger.log(
        `/projects/upload-logo Logo uploaded to ${httpsImageUrl}`,
      );
      return {
        success: true,
        message: `Logo uploaded successfully!`,
        data: httpsImageUrl,
      };
    } catch (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      Sentry.withScope(scope => {
        scope.setTags({
          action: "image-upload",
          source: "projects.controller",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`/projects/upload-logo ${err.message}`);
      return { success: false, message: "Failed to upload the file" };
    }
  }

  @Post("/create")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Creates a new project",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async createProject(
    @Session() { address }: SessionObject,
    @Body() body: CreateProjectInput,
  ): Promise<Response<Project> | ResponseWithNoData> {
    this.logger.log(
      `POST /projects/create ${JSON.stringify(body)} from ${address}`,
    );
    const existingProject = await this.projectsService.find(body.name);

    if (existingProject) {
      return {
        message: `Project ${body.name} already exists`,
        success: false,
      };
    }

    const storedOrganization = await this.organizationsService.findByOrgId(
      body.orgId,
    );

    if (!storedOrganization) {
      return {
        message: `Could not find organization with orgId: ${body.orgId} to match with project: ${body.name}`,
        success: false,
      };
    }

    let storedCategory = await this.projectCategoryService.find(body.category);
    if (!storedCategory) {
      storedCategory = await this.projectCategoryService.create({
        name: body.category,
      });
    }

    this.logger.log(`Project ${body.name} ready for creation`);
    const storedProject = (
      await this.projectsService.create(body)
    ).getProperties();

    const projectCategoryRelationshipExists =
      await this.projectsService.hasRelationshipToCategory(
        storedProject.id,
        storedCategory.getId(),
      );

    if (projectCategoryRelationshipExists === false) {
      this.logger.log(
        `Relating ${storedProject.name} to ${storedCategory.getName()}`,
      );
      await this.projectsService.relateToCategory(
        storedProject.id,
        storedCategory.getId(),
      );
      this.logger.log(
        `Created relationship between ${
          storedProject.name
        } and ${storedCategory.getName()}`,
      );
    }

    const organizationProjectRelationshipExists =
      await this.organizationsService.hasProjectRelationship(
        storedOrganization.getId(),
        storedProject.id,
      );

    if (organizationProjectRelationshipExists === false) {
      await this.organizationsService.addProjectToOrg({
        orgId: storedOrganization.getOrgId(),
        projectId: storedProject.id,
      });
      this.logger.log(
        `Related project ${
          body.name
        } to organization ${storedOrganization.getName()}`,
      );
    }

    return {
      success: true,
      message: `Project created successfully`,
      data: storedProject,
    };
  }

  @Post("/add-by-url")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
  @ApiOkResponse({
    description: "Queues a new project for import on etl",
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async addProjectByUrl(
    @Body() body: AddProjectByUrlInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/projects/add-by-url ${JSON.stringify(body)}`);
    return this.projectsService.addProjectByUrl(body);
  }

  @Post("/update/:id")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Updates an existing project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ProjectWithRelations),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateProject(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
    @Body() dto: UpdateProjectInput,
  ): Promise<Response<ProjectMoreInfo> | ResponseWithNoData> {
    this.logger.log(
      `POST /projects/update ${JSON.stringify(dto)} from ${address}`,
    );
    const { jobsites, detectedJobsites, ...body } = dto;
    const res1 = await this.projectsService.updateProjectDetectedJobsites({
      id: id,
      detectedJobsites: detectedJobsites ?? [],
    });

    if (!res1.success) {
      return {
        success: res1.success,
        message: "Error updating project detected jobsites",
      };
    }

    const res2 = await this.projectsService.updateProjectJobsites({
      id: id,
      jobsites: jobsites ?? [],
    });

    if (!res2.success) {
      return {
        success: res2.success,
        message: "Error updating project jobsites",
      };
    }

    const result = await this.projectsService.update(id, body);
    if (result !== undefined) {
      return {
        success: true,
        message: "Project updated successfully",
        data: result.getProperties(),
      };
    } else {
      return {
        success: false,
        message: "Error updating project",
      };
    }
  }

  @Post("/jobsites/activate")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Activates a list of detected jobsites for a project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Project),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong activating the project jobsites on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async activateProjectJobsites(
    @Session() { address }: SessionObject,
    @Body() body: ActivateProjectJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite[]>> {
    this.logger.log(
      `POST /projects/jobsites/activate ${JSON.stringify(
        body,
      )} from ${address}`,
    );
    return this.projectsService.activateProjectJobsites(body);
  }

  @Post("/jobsites/create")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Creates jobsites for a project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Project),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the project jobsites on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async createProjectJobsite(
    @Session() { address }: SessionObject,
    @Body() body: CreateProjectJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite>> {
    this.logger.log(
      `POST /projects/jobsites/create ${JSON.stringify(body)} from ${address}`,
    );
    const { id, ...jobsite } = body;
    const project = data(
      await this.getProjectDetails({ ...EMPTY_SESSION_OBJECT, address }, id),
    );
    if (project) {
      const id = randomUUID();
      const result = await this.projectsService.updateProjectDetectedJobsites({
        id: body.id,
        detectedJobsites: [...project.detectedJobsites, { id, ...jobsite }],
      });
      if (result.success) {
        const final = data(
          await this.projectsService.activateProjectJobsites({
            id: body.id,
            jobsiteIds: [id],
          }),
        );
        const result = final[0];
        return {
          success: true,
          message: "Jobsite created successfully",
          data: {
            ...final[0],
            createdTimestamp: nonZeroOrNull(result.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(result.updatedTimestamp),
          },
        };
      } else {
        return result;
      }
    } else {
      throw new BadRequestException({
        success: false,
        message: "Project not found",
      });
    }
  }

  @Delete("/delete/:id")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Deletes an existing project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async deleteProject(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`DELETE /projects/delete/${id} from ${address}`);
    return this.projectsService.delete(id);
  }

  @Post("/metrics/update/:id")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Updates an existing projects metrics",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Project),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateProjectMetrics(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
    @Body() body: CreateProjectMetricsInput,
  ): Promise<Response<ProjectMoreInfo> | ResponseWithNoData> {
    this.logger.log(
      `POST /projects/metrics/update/${id} ${JSON.stringify(
        body,
      )} from ${address}`,
    );
    const result = await this.projectsService.updateMetrics(id, body);
    if (result !== undefined) {
      return {
        success: true,
        message: "Project metrics updated successfully",
        data: result.getProperties(),
      };
    } else {
      return {
        success: false,
        message: "Error updating project metrics",
      };
    }
  }

  @Delete("/metrics/delete/:id")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Deletes an existing projects metrics",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async deleteProjectMetrics(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`DELETE /projects/metrics/delete/${id} from ${address}`);
    return this.projectsService.deleteMetrics(id);
  }

  @Post("/link-jobs")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Adds a list of jobs to a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async linkJobsToProject(
    @Session() { address }: SessionObject,
    @Body() body: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(
      `POST /projects/link-jobs ${JSON.stringify(body)} from ${address}`,
    );
    return this.projectsService.linkJobsToProject(body);
  }

  @Post("/link-repos")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Adds a list of repos to a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async linkReposToProject(
    @Session() { address }: SessionObject,
    @Body() body: LinkReposToProjectInput,
  ): Promise<Response<ProjectProps> | ResponseWithNoData> {
    this.logger.log(
      `POST /projects/link-repos ${JSON.stringify(body)} from ${address}`,
    );
    return this.projectsService.linkReposToProject(body);
  }

  @Post("/unlink-jobs")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Removes a list of jobs from a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async unlinkJobsFromProject(
    @Session() { address }: SessionObject,
    @Body() body: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(
      `POST /projects/unlink-jobs ${JSON.stringify(body)} from ${address}`,
    );
    return this.projectsService.unlinkJobsFromProject(body);
  }

  @Post("/unlink-repos")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Removes a list of repos from a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async unlinkReposFromProject(
    @Session() { address }: SessionObject,
    @Body() body: LinkReposToProjectInput,
  ): Promise<Response<ProjectProps> | ResponseWithNoData> {
    this.logger.log(
      `POST /projects/unlink-repos ${JSON.stringify(body)} from ${address}`,
    );
    return this.projectsService.unlinkReposFromProject(body);
  }

  @Get("/:id")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.ADMIN,
    CheckWalletPermissions.PROJECT_MANAGER,
  )
  @ApiOkResponse({
    description: "Returns the details of the project with the provided id",
  })
  async getProjectDetails(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
  ): Promise<
    ResponseWithOptionalData<
      Omit<
        ProjectWithRelations,
        | "hacks"
        | "audits"
        | "chains"
        | "ecosystems"
        | "jobs"
        | "investors"
        | "repos"
        | "ecosystems"
      >
    >
  > {
    this.logger.log(`GET /projects/${id} from ${address}`);
    const result = await this.projectsService.getProjectById(id);

    if (!result) {
      throw new NotFoundException({
        success: false,
        message: "Project not found",
      });
    } else {
      return {
        success: true,
        message: "Retrieved project details successfully",
        data: result,
      };
    }
  }
}
