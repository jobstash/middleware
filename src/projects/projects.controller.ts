import {
  Body,
  Controller,
  Get,
  Header,
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
import { Response as ExpressResponse } from "express";
import { RBACGuard } from "src/auth/rbac.guard";
import { BackendService } from "src/backend/backend.service";
import { Roles } from "src/shared/decorators/role.decorator";
import { btoa, responseSchemaWrapper } from "src/shared/helpers";
import {
  PaginatedData,
  ProjectFilterConfigs,
  ProjectProperties,
  ProjectDetails,
  Response,
  ResponseWithNoData,
  Project,
} from "src/shared/types";
import { CreateProjectInput } from "./dto/create-project.input";
import { UpdateProjectInput } from "./dto/update-project.input";
import { ProjectsService } from "./projects.service";
import { CheckWalletRoles } from "src/shared/types";
import { NFTStorage, File } from "nft.storage";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/presets/cache-control";
import { ValidationError } from "class-validator";
import { ProjectListParams } from "./dto/project-list.input";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require("mime");

@Controller("projects")
@ApiExtraModels(ProjectProperties)
export class ProjectsController {
  private readonly NFT_STORAGE_API_KEY;
  private readonly nftStorageClient: NFTStorage;
  logger = new CustomLogger(ProjectsController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly backendService: BackendService,
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ProjectProperties) }),
  })
  async getProjects(): Promise<
    Response<ProjectProperties[]> | ResponseWithNoData
  > {
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
    type: PaginatedData<Project>,
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
              items: { $ref: getSchemaPath(Project) },
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
  ): Promise<PaginatedData<Project>> {
    const paramsParsed = {
      ...params,
      query: btoa(params.query),
    };
    this.logger.log(`/projects/list ${JSON.stringify(paramsParsed)}`);
    return this.projectsService.getProjectsListWithSearch(paramsParsed);
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
  async getFilterConfigs(): Promise<ProjectFilterConfigs> {
    this.logger.log(`/projects/filters`);
    return this.projectsService.getFilterConfigs();
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
  ): Promise<ProjectDetails | undefined> {
    this.logger.log(`/projects/details/${id}`);
    const result = this.projectsService.getProjectDetailsById(id);
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjectsByCategory(
    @Param("category") category: string,
  ): Promise<Response<Project[]> | ResponseWithNoData> {
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjectCompetitors(
    @Param("id") id: string,
  ): Promise<Response<Project[]> | ResponseWithNoData> {
    this.logger.log(`/projects/competitors/${id}`);
    return this.projectsService
      .getProjectCompetitors(id)
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjectsByOrgId(
    @Param("id") id: string,
  ): Promise<Response<Project[]> | ResponseWithNoData> {
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async searchProjects(
    @Query("query") query: string,
  ): Promise<Response<Project[]> | ResponseWithNoData> {
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

  @Get("/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the details of the project with the provided id",
  })
  async getProjectDetails(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<Project> | ResponseWithNoData> {
    this.logger.log(`/projects/${id}`);
    const result = await this.projectsService.getProjectById(id);

    if (result === undefined) {
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ProjectProperties) }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async createProject(
    @Body() body: CreateProjectInput,
  ): Promise<Response<ProjectProperties> | ResponseWithNoData> {
    this.logger.log(`/projects/create ${JSON.stringify(body)}`);
    return this.backendService.createProject(body);
  }

  @Post("/update")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates an existing project",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ProjectProperties) }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateProject(
    @Body() body: UpdateProjectInput,
  ): Promise<Response<ProjectProperties> | ResponseWithNoData> {
    this.logger.log(`/projects/update ${JSON.stringify(body)}`);
    return this.backendService.updateProject(body);
  }
}
