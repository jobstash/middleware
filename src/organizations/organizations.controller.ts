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
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  Repository,
  Organization,
  Response,
  ResponseWithNoData,
  ShortOrg,
  PaginatedData,
  OrgFilterConfigs,
  OrgDetailsResult,
  ResponseWithOptionalData,
  OrganizationWithLinks,
} from "src/shared/types";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import { OrganizationsService } from "./organizations.service";
import { CheckWalletRoles, ECOSYSTEM_HEADER } from "src/shared/constants";
import { NFTStorage, File } from "nft.storage";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "src/shared/constants/cache-control";
import { ValidationError } from "class-validator";
import { OrgListParams } from "./dto/org-list.input";
import { UpdateOrgAliasesInput } from "./dto/update-organization-aliases.input";
import { UpdateOrgCommunitiesInput } from "./dto/update-organization-communities.input";
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
  async getOrganizations(): Promise<
    ResponseWithOptionalData<OrganizationWithLinks[]>
  > {
    this.logger.log(`/organizations`);
    return this.organizationsService
      .getAllWithLinks()
      .then(res => ({
        success: true,
        message: "Retrieved all organizations successfully",
        data: res ?? [],
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
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<PaginatedData<ShortOrg>> {
    const enrichedParams = {
      ...params,
      communities: ecosystem
        ? [...(params.communities ?? []), ecosystem]
        : params.communities,
    };
    this.logger.log(`/organizations/list ${JSON.stringify(enrichedParams)}`);
    return this.organizationsService.getOrgsListWithSearch(enrichedParams);
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
  async getFilterConfigs(
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<OrgFilterConfigs> {
    this.logger.log(`/jobs/filters`);
    return this.organizationsService.getFilterConfigs(ecosystem);
  }

  @Get("/featured")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ANON)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of orgs with featured jobs",
    type: Response<ShortOrg[]>,
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
  async getFeaturedOrgsList(
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<ShortOrg[]>> {
    this.logger.log(`/organizations/featured`);
    return this.organizationsService.getFeaturedOrgs(ecosystem);
  }

  @Get("details/:id")
  @ApiOkResponse({
    description: "Returns the organization details for the provided id",
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(OrgDetailsResult),
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
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<OrgDetailsResult | undefined> {
    this.logger.log(`/organizations/details/${id}`);
    const result = await this.organizationsService.getOrgDetailsById(
      id,
      ecosystem,
    );
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

  @Post("/update/:id")
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
    @Param("id") id: string,
    @Body() body: UpdateOrganizationInput,
  ): Promise<ResponseWithOptionalData<Organization>> {
    this.logger.log(`/organizations/update/${id} ${JSON.stringify(body)}`);

    try {
      const {
        grants,
        projects,
        communities,
        aliases,
        website,
        twitter,
        github,
        discord,
        docs,
        telegram,
        ...dto
      } = body;

      const res1 = await this.updateOrgAliases({ orgId: id, aliases });

      if (!res1.success) {
        return res1;
      }

      const res2 = await this.updateOrgCommunities({ orgId: id, communities });

      if (!res2.success) {
        return res2;
      }

      const res3 = await this.organizationsService.updateOrgWebsites({
        orgId: id,
        websites: website,
      });

      if (!res3.success) {
        return res3;
      }

      const res4 = await this.organizationsService.updateOrgTwitters({
        orgId: id,
        twitters: twitter,
      });

      if (!res4.success) {
        return res4;
      }

      const res5 = await this.organizationsService.updateOrgGithubs({
        orgId: id,
        githubs: github,
      });

      if (!res5.success) {
        return res5;
      }

      const res6 = await this.organizationsService.updateOrgDiscords({
        orgId: id,
        discords: discord,
      });

      if (!res6.success) {
        return res6;
      }

      const res7 = await this.organizationsService.updateOrgDocs({
        orgId: id,
        docsites: docs,
      });

      if (!res7.success) {
        return res7;
      }

      const res8 = await this.organizationsService.updateOrgTelegrams({
        orgId: id,
        telegrams: telegram,
      });

      if (!res8.success) {
        return res8;
      }

      const res9 = await this.organizationsService.updateOrgGrants({
        orgId: id,
        grants: grants,
      });

      if (!res9.success) {
        return res9;
      }

      const res10 = await this.organizationsService.relateToProjects(
        id,
        projects,
      );

      if (!res10) {
        return {
          success: res10,
          message: "Error updating org projects",
        };
      }

      const result = await this.organizationsService.update(id, dto);

      return {
        success: true,
        message: "Organization updated successfully",
        data: result.getProperties(),
      };
    } catch (error) {
      this.logger.error(`/organizations/update/${id} ${error}`);
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "projects.controller",
        });
        Sentry.captureException(error);
      });
      return {
        success: false,
        message: `An unexpected error occured`,
      };
    }
  }

  @Delete("/delete/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Deletes an existing organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong deleting the organization on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async deleteOrganization(
    @Param("id") id: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/organizations/delete/${id}`);
    return this.organizationsService.delete(id);
  }

  @Post("/add-alias")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Upserts an org with a new alias",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the organization alias on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateOrgAliases(
    @Body() body: UpdateOrgAliasesInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/organizations/add-alias ${JSON.stringify(body)}`);
    return this.organizationsService.updateOrgAliases(body);
  }

  @Post("/communities")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Upserts an org with a new set of communities",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the organization communities on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateOrgCommunities(
    @Body() body: UpdateOrgCommunitiesInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/organizations/communities ${JSON.stringify(body)}`);
    return this.organizationsService.updateOrgCommunities(body);
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
