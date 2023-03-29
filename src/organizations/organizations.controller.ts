import {
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
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse } from "express";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import { Response, ResponseWithNoData, ShortOrg } from "src/shared/types";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@ApiExtraModels(ShortOrg)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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
          fileType: "png",
        })
        .addFileTypeValidator({
          fileType: "svg",
        })
        .addMaxSizeValidator({
          maxSize: 10000,
        })
        .build({
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: Express.Multer.File,
  ): Promise<Response<string>> {
    return {
      success: true,
      message: "Logo uploaded successfully!",
      data: "https://example.com/" + file.filename,
    };
  }
}
