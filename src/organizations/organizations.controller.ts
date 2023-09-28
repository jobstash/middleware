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
import { Roles } from "src/shared/decorators/role.decorator";
import { btoa, responseSchemaWrapper } from "src/shared/helpers";
import {
  Repository,
  Organization,
  Response,
  ResponseWithNoData,
  ShortOrg,
  PaginatedData,
  OrgFilterConfigs,
  OrgListResult,
} from "src/shared/types";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import { OrganizationsService } from "./organizations.service";
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
import { OrgListParams } from "./dto/org-list.input";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require("mime");

@Controller("organizations")
@ApiExtraModels(ShortOrg, Organization)
export class OrganizationsController {
  private readonly NFT_STORAGE_API_KEY;
  private readonly nftStorageClient: NFTStorage;
  private readonly logger = new CustomLogger(OrganizationsController.name);

  constructor(
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
    description: "Returns a list of all organizations",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ShortOrg) }),
  })
  async getOrganizations(): Promise<Response<ShortOrg[]> | ResponseWithNoData> {
    this.logger.log(`/organizations`);
    return this.organizationsService
      .getAll()
      .then(res => ({
        success: true,
        message: "Retrieved all organizations successfully",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "organizations.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/organizations ${err.message}`);
        return {
          success: false,
          message: `Error retrieving organizations!`,
        };
      });
  }

  @Get("/list")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of organizations that satisfy the search and filter predicate",
    type: PaginatedData<Organization>,
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
              items: { $ref: getSchemaPath(Organization) },
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
  async getOrgsListWithSearch(
    @Query(new ValidationPipe({ transform: true }))
    params: OrgListParams,
  ): Promise<PaginatedData<ShortOrg>> {
    const paramsParsed = {
      ...params,
      query: btoa(params.query),
    };
    this.logger.log(`/organizations/list ${JSON.stringify(paramsParsed)}`);
    return this.organizationsService.getOrgsListWithSearch(paramsParsed);
  }

  @Get("/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns the configuration data for the ui filters",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(OrgFilterConfigs),
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of values that failed validation",
    type: ValidationError,
  })
  async getFilterConfigs(): Promise<OrgFilterConfigs> {
    this.logger.log(`/jobs/filters`);
    return this.organizationsService.getFilterConfigs();
  }

  @Get("/search")
  @ApiOkResponse({
    description:
      "Returns a list of all organizations with names matching the query",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(ShortOrg) }),
  })
  async searchOrganizations(
    @Query("query") query: string,
  ): Promise<Response<ShortOrg[]> | ResponseWithNoData> {
    this.logger.log(`/organizations/search?query=${query}`);
    return this.organizationsService
      .searchOrganizations(query)
      .then(res => ({
        success: true,
        message: "Retrieved matching organizations successfully",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "organizations.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(
          `/organizations/search?query=${query} ${err.message}`,
        );
        return {
          success: false,
          message: `Error retrieving organizations for query!`,
        };
      });
  }

  @Get("details/:id")
  @ApiOkResponse({
    description: "Returns the organization details for the provided id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(OrgListResult),
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
      "Returns that no organization details were found for the provided id",
    type: ResponseWithNoData,
  })
  async getOrgDetailsById(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<OrgListResult | undefined> {
    this.logger.log(`/organizations/details/${id}`);
    const result = await this.organizationsService.getOrgDetailsById(id);
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the details of the org with the provided id",
  })
  async getOrgDetails(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<ShortOrg> | ResponseWithNoData> {
    this.logger.log(`/organizations/${id}`);
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
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description:
      "Uploads an organizations logo and returns the url to the cloud file",
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
    this.logger.log(`/organizations/upload-logo`);
    try {
      this.logger.log(
        "/organizations/upload-logo Uploading logo to IPFS: ",
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
        `/organizations/upload-logo Logo uploaded to ${httpsImageUrl}`,
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
          source: "organizations.controller",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`/organizations/upload-logo ${err.message}`);
      return {
        success: false,
        message: `Logo upload failed!`,
      };
    }
  }

  @Post("/create")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Creates a new organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the organization on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async createOrganization(
    @Body() body: CreateOrganizationInput,
  ): Promise<Response<Organization> | ResponseWithNoData> {
    this.logger.log(`/organizations/create ${JSON.stringify(body)}`);
    let organization = await this.organizationsService.find(body.name);

    if (organization)
      return {
        success: false,
        message: `Organization ${body.name} already exists, returning existing organization`,
        data: organization.getProperties(),
      };

    try {
      organization = await this.organizationsService.create(body);

      return {
        success: true,
        data: organization.getProperties(),
        message: "Organization created",
      };
    } catch (error) {
      this.logger.error(error);
      return {
        success: false,
        message: `An unexpected error occured`,
      };
    }
  }

  @Post("/update")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates an existing organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the organization on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateOrganization(
    @Body() body: UpdateOrganizationInput,
  ): Promise<Response<Organization> | ResponseWithNoData> {
    this.logger.log(`/organizations/update ${JSON.stringify(body)}`);
    const storedOrganization = await this.organizationsService.find(body.name);

    if (!storedOrganization) {
      return new Promise(resolve => {
        resolve({
          success: false,
          message: `Organization ${body.name} not found, but trying to edit it`,
        });
      });
    }

    try {
      const updatedOrganization = await this.organizationsService.update(
        storedOrganization.getId(),
        body,
      );

      return {
        success: true,
        data: updatedOrganization.getProperties(),
        message: "Organization already exists, returning existing organization",
      };
    } catch (error) {
      this.logger.error(error);
      return {
        success: false,
        message: `An unexpected error occured`,
      };
    }
  }

  @Get("/repositories/:id")
  @ApiOkResponse({
    description:
      "Returns an aggregate of project repositories for the specified organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Repository),
    }),
  })
  async getRepositoriesForOrganization(
    @Param("id") id: string,
  ): Promise<Response<Repository[]> | ResponseWithNoData> {
    this.logger.log(`/organizations/repositories/${id}`);
    return this.organizationsService
      .getRepositories(id)
      .then(res => ({
        success: true,
        message: "Retrieved organization repositories successfully",
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
        this.logger.error(`/organizations/repositories/${id} ${err.message}`);
        return {
          success: false,
          message: `Error retrieving organization repositories!`,
        };
      });
  }
}
