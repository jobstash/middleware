import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpStatus,
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
import { RBACGuard } from "src/auth/rbac.guard";
import { OrganizationsService } from "src/organizations/organizations.service";
import { CheckWalletRoles, ECOSYSTEM_HEADER } from "src/shared/constants";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/constants/cache-control";
import { Roles } from "src/shared/decorators";
import { responseSchemaWrapper } from "src/shared/helpers";
import { ProjectProps } from "src/shared/models";
import {
  DefiLlamaProject,
  DefiLlamaProjectPrefill,
  DexSummary,
  FeeOverview,
  OptionsSummary,
  PaginatedData,
  Project,
  ProjectDetails,
  ProjectFilterConfigs,
  ProjectListResult,
  ProjectMoreInfo,
  ProjectMoreInfoEntity,
  ProjectWithRelations,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require("mime");

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
    (this.NFT_STORAGE_API_KEY = this.configService.get<string>(
      "NFT_STORAGE_API_KEY",
    )),
      (this.nftStorageClient = new NFTStorage({
        token: this.NFT_STORAGE_API_KEY,
      }));
  }

  @Get("/")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all projects",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjects(): Promise<Response<Project[]> | ResponseWithNoData> {
    this.logger.log(`/projects`);
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
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
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
      "Returns an error message with a list of values that failed validation",
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
      communities: ecosystem
        ? [...(params.communities ?? []), ecosystem]
        : params.communities,
    };
    this.logger.log(`/projects/list ${JSON.stringify(enrichedParams)}`);
    return this.projectsService.getProjectsListWithSearch(enrichedParams);
  }

  @Get("/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
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
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  async getFilterConfigs(
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<ProjectFilterConfigs> {
    this.logger.log(`/projects/filters`);
    return this.projectsService.getFilterConfigs(ecosystem);
  }

  @Get("details/:id")
  @ApiOkResponse({
    description: "Returns the project details for the provided id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ProjectDetails),
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
  async getProjectDetailsById(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<ProjectDetails | undefined> {
    this.logger.log(`/projects/details/${id}`);
    const result = await this.projectsService.getProjectDetailsById(
      id,
      ecosystem,
    );
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("/category/:category")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all projects under the speccified category",
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
        this.logger.error(`/projects/competitors/${id} ${err.message}`);
        return {
          success: false,
          message: `Error retrieving project competitors!`,
        };
      });
  }

  @Get("/all/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all projects for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ProjectWithRelations),
    }),
  })
  async getProjectsByOrgId(
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<ProjectProps[]>> {
    this.logger.log(`/projects/all/${id}`);
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all projects with names matching the query",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ProjectWithRelations),
    }),
  })
  async searchProjects(
    @Query("query") query: string,
  ): Promise<ResponseWithOptionalData<ProjectProps[]>> {
    this.logger.log(`/projects/search?query=${query}`);
    return this.projectsService
      .searchProjects(query)
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description:
      "Returns the details of the project retrieved from the passed defillama url",
  })
  async getProjectDetailsFromDefillama(
    @Query("url") url: string,
  ): Promise<ResponseWithOptionalData<DefiLlamaProjectPrefill>> {
    this.logger.log(`/prefiller?url=${url}`);

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
                orgId: "-1",
                name: project.name,
                logo: project.logo,
                tokenSymbol: project.symbol,
                tvl: thisProjectsData?.tvl,
                monthlyVolume:
                  (dexOverview?.total30d || 0) +
                  (optionOverview?.total30d || 0),
                monthlyFees: feesOverview?.total30d ?? 0,
                monthlyRevenue: revenueOverview?.total30d ?? 0,
                tokenAddress: thisProjectsData?.address,
                description: project.description,
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

  @Get("/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the details of the project with the provided id",
  })
  async getProjectDetails(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<ProjectProps>> {
    this.logger.log(`/projects/${id}`);
    const result = await this.projectsService.getProjectById(id);

    if (result === null) {
      res.status(HttpStatus.NOT_FOUND);
      return { success: true, message: "No project found for id " + id };
    } else {
      return {
        success: true,
        message: "Retrieved project details successfully",
        data: result,
      };
    }
  }

  @Post("/upload-logo")
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
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
      const type = mime.getType(file.originalname);
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
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
    @Body() body: CreateProjectInput,
  ): Promise<Response<Project> | ResponseWithNoData> {
    this.logger.log(`/projects/create ${JSON.stringify(body)}`);
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
      await this.organizationsService.relateToProject(
        storedOrganization.getId(),
        storedProject.id,
      );
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

  @Post("/update/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
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
    @Param("id") id: string,
    @Body() body: UpdateProjectInput,
  ): Promise<Response<ProjectMoreInfo> | ResponseWithNoData> {
    this.logger.log(`/projects/update ${JSON.stringify(body)}`);
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

  @Delete("/delete/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Deletes an existing project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async deleteProject(@Param("id") id: string): Promise<ResponseWithNoData> {
    this.logger.log(`/projects/delete/${id}`);
    return this.projectsService.delete(id);
  }

  @Post("/metrics/update/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
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
    @Param("id") id: string,
    @Body() body: CreateProjectMetricsInput,
  ): Promise<Response<ProjectMoreInfo> | ResponseWithNoData> {
    this.logger.log(`/projects/metrics/update ${JSON.stringify(body)}`);
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Deletes an existing projects metrics",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async deleteProjectMetrics(
    @Param("id") id: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/projects/metrics/delete/${id}`);
    return this.projectsService.deleteMetrics(id);
  }

  @Post("/link-jobs")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Adds a list of jobs to a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async linkJobsToProject(
    @Body() body: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/projects/link-jobs`);
    return this.projectsService.linkJobsToProject(body);
  }

  @Post("/link-repos")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Adds a list of repos to a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async linkReposToProject(
    @Body() body: LinkReposToProjectInput,
  ): Promise<Response<ProjectProps> | ResponseWithNoData> {
    this.logger.log(`/projects/link-repos`);
    return this.projectsService.linkReposToProject(body);
  }

  @Post("/unlink-jobs")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Removes a list of jobs from a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async unlinkJobsFromProject(
    @Body() body: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/projects/unlink-jobs`);
    return this.projectsService.unlinkJobsFromProject(body);
  }

  @Post("/unlink-repos")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Removes a list of repos from a project",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async unlinkReposFromProject(
    @Body() body: LinkReposToProjectInput,
  ): Promise<Response<ProjectProps> | ResponseWithNoData> {
    this.logger.log(`/projects/unlink-repos`);
    return this.projectsService.unlinkReposFromProject(body);
  }
}
