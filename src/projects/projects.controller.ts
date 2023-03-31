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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require("mime");

@Controller("projects")
@ApiExtraModels(Project)
export class ProjectsController {
  private readonly NFT_STORAGE_API_KEY;
  private readonly nftStorageClient: NFTStorage;

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

  @Get("/all/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all projects",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Project) }),
  })
  async getProjectsByOrgId(
    @Param("id") id: string,
  ): Promise<Response<Project[]>> {
    return this.projectsService.getProjectsByOrgId(id).then(res => ({
      success: true,
      message: "Retrieved all projects successfully",
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
    description: "Returns the details of the org with the provided id",
  })
  async getProjectDetails(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<Project> | ResponseWithNoData> {
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
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipeBuilder().build({
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
  ): Promise<Response<string>> {
    try {
      console.log("Uploading logo to IPFS: ", file.originalname);
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

      console.log(`Logo uploaded to ${httpsImageUrl}`);
      return {
        success: true,
        message: `Logo uploaded successfully!`,
        data: httpsImageUrl,
      };
    } catch (err) {
      // Handle the error as needed
      console.error(err);
      throw new Error("Failed to upload the file");
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
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<Project> | ResponseWithNoData> {
    const result = await this.backendService.createProject(body);
    if (result === undefined) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        success: false,
        message: "Something went wrong creating the project",
      };
    } else {
      return {
        success: true,
        message: "Project created successfully",
        data: result,
      };
    }
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
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<Project> | ResponseWithNoData> {
    const result = await this.backendService.updateProject(body);
    if (result === undefined) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        success: false,
        message: "Something went wrong updating the project",
      };
    } else {
      return {
        success: true,
        message: "Project updated successfully",
        data: result,
      };
    }
  }
}
