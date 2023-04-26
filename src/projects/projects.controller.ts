import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { Response as ExpressResponse } from "express";
import { RBACGuard } from "src/auth/rbac.guard";
import { BackendService } from "src/backend/backend.service";
import { Roles } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import { Project, Response, ResponseWithNoData } from "src/shared/types";
import { CreateProjectInput } from "./dto/create-project.input";
import { UpdateProjectInput } from "./dto/update-project.input";
import { ProjectsService } from "./projects.service";
import { CheckWalletRoles } from "src/shared/types";
import { NFTStorage, File } from "nft.storage";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require("mime");

@Controller("projects")
@ApiExtraModels(Project)
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
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjects(): Promise<Response<Project[]>> {
    this.logger.log(`/projects`);
    return this.projectsService.getProjects().then(res => ({
      success: true,
      message: "Retrieved all projects successfully",
      data: res,
    }));
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
  ): Promise<Response<Project[]>> {
    this.logger.log(`/projects/category/${category}`);
    return this.projectsService.getProjectsByCategory(category).then(res => ({
      success: true,
      message: "Retrieved all projects in category successfully",
      data: res,
    }));
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
  ): Promise<Response<Project[]>> {
    this.logger.log(`/projects/all/${id}`);
    return this.projectsService.getProjectsByOrgId(id).then(res => ({
      success: true,
      message: "Retrieved all organization projects successfully",
      data: res,
    }));
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
  ): Promise<Response<Project[]>> {
    this.logger.log(`/projects/search?query=${query}`);
    return this.projectsService.searchProjects(query).then(res => ({
      success: true,
      message: "Retrieved matching projects successfully",
      data: res,
    }));
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
  // @UseGuards(RBACGuard)
  // @Roles(CheckWalletRoles.ADMIN)
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
    return this.backendService.createProject(body);
  }

  @Post("/update")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates an existing project",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateProject(
    @Body() body: UpdateProjectInput,
  ): Promise<Response<Project> | ResponseWithNoData> {
    this.logger.log(`/projects/update ${JSON.stringify(body)}`);
    return this.backendService.updateProject(body);
  }
}
