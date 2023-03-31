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
import {
  Organization,
  Response,
  ResponseWithNoData,
  ShortOrg,
} from "src/shared/types";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import { OrganizationsService } from "./organizations.service";
import { promisify } from "util";

import * as IPFSMini from "ipfs-mini";
const ipfsClient = new IPFSMini({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
});

const addFile = promisify(ipfsClient.add.bind(ipfsClient));

@Controller("organizations")
@ApiExtraModels(ShortOrg, Organization)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly backendService: BackendService,
  ) {}

  @Get("/")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({
    description: "Returns a list of all organizations",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ShortOrg) }),
  })
  async getOrganizations(): Promise<Response<ShortOrg[]>> {
    return this.organizationsService.getAll().then(res => ({
      success: true,
      message: "Retrieved all organizations successfully",
      data: res,
    }));
  }

  @Get("/search")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({
    description:
      "Returns a list of all organizations with names matching the query",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ShortOrg) }),
  })
  async searchOrganizations(
    @Query("query") query: string,
  ): Promise<Response<ShortOrg[]>> {
    return this.organizationsService.searchOrganizations(query).then(res => ({
      success: true,
      message: "Retrieved matching organizations successfully",
      data: res,
    }));
  }

  @Get("/:id")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({
    description: "Returns the details of the org with the provided id",
  })
  async getOrgDetails(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<ShortOrg> | ResponseWithNoData> {
    const result = await this.organizationsService.getOrgById(id);

    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
      return { success: true, message: "No organization found for id " + id };
    } else {
      return {
        success: true,
        message: "Retrieved organization details successfully",
        data: result,
      };
    }
  }

  @Post("/upload-logo")
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({
    description:
      "Uploads an organizations logo and returns the url to the cloud file",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: "jpeg",
        })
        .addFileTypeValidator({
          fileType: "jpg",
        })
        .addFileTypeValidator({
          fileType: "gif",
        })
        .addFileTypeValidator({
          fileType: "png",
        })
        .addFileTypeValidator({
          fileType: "svg",
        })
        .addMaxSizeValidator({
          maxSize: 1000,
        })
        .build({
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: Express.Multer.File,
  ): Promise<Response<string>> {
    try {
      const cid = await addFile(file.buffer);
      const gateway = "https://ipfs.io"; // Replace with your preferred gateway
      const url = `${gateway}/ipfs/${cid}`;

      return {
        success: true,
        message: "Logo uploaded successfully!",
        data: url,
      };
    } catch (err) {
      // Handle the error as needed
      throw new Error("Failed to upload the file");
    }
  }

  @Post("/create")
  // @UseGuards(RBACGuard)
  // @Roles("admin")
  @ApiOkResponse({
    description: "Creates a new organization",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Organization) }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the organization on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async createOrganization(
    @Body() body: CreateOrganizationInput,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<Organization> | ResponseWithNoData> {
    const result = await this.backendService.createOrganization(body);
    console.log(result);
    if (result === undefined) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        success: false,
        message: "Something went wrong creating the organization",
      };
    } else {
      return {
        success: true,
        message: "Organization created successfully",
        data: result,
      };
    }
  }

  @Post("/update")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({
    description: "Updates an existing organization",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Organization) }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the organization on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateOrganization(
    @Body() body: UpdateOrganizationInput,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<Organization> | ResponseWithNoData> {
    const result = await this.backendService.updateOrganization(body);
    if (result === undefined) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        success: false,
        message: "Something went wrong updating the organization",
      };
    } else {
      return {
        success: true,
        message: "Organization updated successfully",
        data: result,
      };
    }
  }
}
