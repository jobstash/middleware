import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { Response as ExpressResponse } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions } from "src/shared/decorators/role.decorator";
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
  Jobsite,
  TinyOrg,
} from "src/shared/types";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import { OrganizationsService } from "./organizations.service";
import { CheckWalletPermissions, COMMUNITY_HEADER } from "src/shared/constants";
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
import { ActivateOrgJobsiteInput } from "./dto/activate-organization-jobsites.input";
import { UpdateOrgProjectInput } from "./dto/update-organization-projects.input";
import { AddOrganizationByUrlInput } from "./dto/add-organization-by-url.input";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require("mime");

@Controller("organizations")
@ApiExtraModels(ShortOrg, TinyOrg, Organization)
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all organizations",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(OrganizationWithLinks),
    }),
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
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  @ApiOkResponse({
    description:
      "Returns a paginated sorted list of organizations that satisfy the search and filter predicate",
    type: PaginatedData<ShortOrg>,
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
              items: { $ref: getSchemaPath(ShortOrg) },
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
  async getOrgsListWithSearch(
    @Query(new ValidationPipe({ transform: true }))
    params: OrgListParams,
    @Headers(COMMUNITY_HEADER) community: string | undefined,
  ): Promise<PaginatedData<ShortOrg>> {
    const enrichedParams = {
      ...params,
      communities: community
        ? [...(params.communities ?? []), community]
        : params.communities,
    };
    this.logger.log(`/organizations/list ${JSON.stringify(enrichedParams)}`);
    return this.organizationsService.getOrgsListWithSearch(enrichedParams);
  }

  @Get("/all")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ORG_AFFILIATE)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of all organizations",
    type: Array<TinyOrg>,
    schema: {
      allOf: [
        {
          type: "array",
          items: { $ref: getSchemaPath(TinyOrg) },
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
  async getAllOrgsList(): Promise<Array<TinyOrg>> {
    this.logger.log(`/organizations/all`);
    return this.organizationsService.getAllOrgsList();
  }

  @Get("/filters")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
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
      "Returns an error message with a list of params that failed validation",
    type: ValidationError,
  })
  async getFilterConfigs(
    @Headers(COMMUNITY_HEADER) community: string | undefined,
  ): Promise<OrgFilterConfigs> {
    this.logger.log(`/jobs/filters`);
    return this.organizationsService.getFilterConfigs(community);
  }

  @Get("/featured")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns a list of orgs with featured jobs",
    type: Response<ShortOrg[]>,
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
  async getFeaturedOrgsList(
    @Headers(COMMUNITY_HEADER) community: string | undefined,
  ): Promise<ResponseWithOptionalData<ShortOrg[]>> {
    this.logger.log(`/organizations/featured`);
    return this.organizationsService.getFeaturedOrgs(community);
  }

  @Get("id/:domain")
  @ApiBadRequestResponse({
    description:
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no organization id was found for the specified domain",
    type: ResponseWithNoData,
  })
  async getOrgIdByDomain(
    @Param("domain") domain: string,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/organizations/id/${domain}`);
    return this.organizationsService.findOrgIdByWebsite(domain);
  }

  @Get("details/:id")
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  @ApiOkResponse({
    description:
      "Returns the organization details for the provided internal id",
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
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no organization details were found for the provided internal id",
    type: ResponseWithNoData,
  })
  async getOrgDetailsById(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Headers(COMMUNITY_HEADER) community: string | undefined,
  ): Promise<OrgDetailsResult | undefined> {
    this.logger.log(`/organizations/details/${id}`);
    const result = await this.organizationsService.getOrgDetailsById(
      id,
      community,
    );
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("details/slug/:slug")
  @ApiHeader({
    name: COMMUNITY_HEADER,
    required: false,
    description:
      "Optional header to tailor the response for a specific community",
  })
  @ApiOkResponse({
    description: "Returns the organization details for the provided slug",
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
      "Returns an error message with a list of query params that failed validation",
    type: ValidationError,
  })
  @ApiNotFoundResponse({
    description:
      "Returns that no organization details were found for the provided slug",
    type: ResponseWithNoData,
  })
  async getOrgDetailsBySlug(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Headers(COMMUNITY_HEADER) community: string | undefined,
  ): Promise<OrgDetailsResult | undefined> {
    this.logger.log(`/organizations/details/slug/${slug}`);
    const result = await this.organizationsService.getOrgDetailsBySlug(
      slug,
      community,
    );
    if (result === undefined) {
      res.status(HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Post("/upload-logo")
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN)
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
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

  @Post("/add-by-url")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
  @ApiOkResponse({
    description: "Queues a new organization for import on etl",
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the organization on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async addOrganizationByUrl(
    @Body() body: AddOrganizationByUrlInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/organizations/add-by-url ${JSON.stringify(body)}`);
    return this.organizationsService.addOrganizationByUrl(body);
  }

  @Post("/update/:id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
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
      const org = await this.organizationsService.findByOrgId(id);

      if (!org) {
        throw new NotFoundException({
          success: false,
          message: `Org with orgId ${id} not found`,
        });
      }
      const {
        grants,
        projects,
        communities,
        aliases,
        websites,
        twitters,
        githubs,
        discords,
        docs,
        telegrams,
        jobsites,
        detectedJobsites,
        ...dto
      } = body;

      const res1 = await this.updateOrgAliases({
        orgId: id,
        aliases: aliases ?? [],
      });

      if (!res1.success) {
        return res1;
      }

      const res2 = await this.updateOrgCommunities({
        orgId: id,
        communities: communities ?? [],
      });

      if (!res2.success) {
        return res2;
      }

      const res3 = await this.organizationsService.updateOrgWebsites({
        orgId: id,
        websites: websites ?? [],
      });

      if (!res3.success) {
        return res3;
      }

      const res4 = await this.organizationsService.updateOrgTwitters({
        orgId: id,
        twitters: twitters ?? [],
      });

      if (!res4.success) {
        return res4;
      }

      const res5 = await this.organizationsService.updateOrgGithubs({
        orgId: id,
        githubs: githubs ?? [],
      });

      if (!res5.success) {
        return res5;
      }

      const res6 = await this.organizationsService.updateOrgDiscords({
        orgId: id,
        discords: discords ?? [],
      });

      if (!res6.success) {
        return res6;
      }

      const res7 = await this.organizationsService.updateOrgDocs({
        orgId: id,
        docsites: docs ?? [],
      });

      if (!res7.success) {
        return res7;
      }

      const res8 = await this.organizationsService.updateOrgTelegrams({
        orgId: id,
        telegrams: telegrams ?? [],
      });

      if (!res8.success) {
        return res8;
      }

      const res9 = await this.organizationsService.updateOrgGrants({
        orgId: id,
        grantsites: grants ?? [],
      });

      if (!res9.success) {
        return res9;
      }

      const res10 = await this.organizationsService.updateOrgProjects(
        id,
        projects ?? [],
      );

      if (!res10.success) {
        return {
          success: res10.success,
          message: "Error updating org projects",
        };
      }

      if (detectedJobsites?.length > 0) {
        const res11 = await this.organizationsService.updateOrgDetectedJobsites(
          {
            orgId: id,
            detectedJobsites,
          },
        );

        if (!res11.success) {
          return {
            success: res11.success,
            message: "Error updating org detected jobsites",
          };
        }
      }

      const res12 = await this.organizationsService.updateOrgJobsites({
        orgId: id,
        jobsites: jobsites ?? [],
      });

      if (!res12.success) {
        return {
          success: res12.success,
          message: "Error updating org jobsites",
        };
      }

      const result = await this.organizationsService.update(id, dto);

      if (result) {
        return {
          success: true,
          message: "Organization updated successfully",
          data: result?.getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Error updating org",
        };
      }
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
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

  @Post("/add-project")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
  @ApiOkResponse({
    description: "Add a project to an org",
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong adding the project to an org on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async addProjectToOrg(
    @Body() body: UpdateOrgProjectInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/organizations/add-project ${JSON.stringify(body)}`);
    return this.organizationsService.addProjectToOrg(body);
  }

  @Post("/remove-project")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
  @ApiOkResponse({
    description: "Remove a project from an org",
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong removing the project from an org on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async removeProjectFromOrg(
    @Body() body: UpdateOrgProjectInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/organizations/remove-project ${JSON.stringify(body)}`);
    return this.organizationsService.removeProjectFromOrg(body);
  }

  @Post("/transform-to-project/:id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
  @ApiOkResponse({
    description: "Transforms an org to a project",
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong transforming the org to a project on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async transformOrgToProject(
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<Omit<Organization, "orgId">>> {
    this.logger.log(`/organizations/transform-to-project ${id}`);
    return this.organizationsService.transformOrgToProject(id);
  }

  @Post("/communities")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
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

  @Post("/jobsites/activate")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN)
  @ApiOkResponse({
    description: "Activates a list of detected jobsites for an org",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong activating the organization jobsites on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async activateOrgJobsites(
    @Body() body: ActivateOrgJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite[]>> {
    this.logger.log(`/organizations/jobsites/activate ${JSON.stringify(body)}`);
    return this.organizationsService.activateOrgJobsites(body);
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

  @Get("/:id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN, CheckWalletPermissions.ORG_MANAGER)
  @ApiOkResponse({
    description: "Returns the details of the org with the provided id",
  })
  async getOrgDetails(
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<OrganizationWithLinks>> {
    this.logger.log(`/organizations/${id}`);
    const result = await this.organizationsService.getOrgById(id);

    if (result === undefined) {
      throw new NotFoundException({
        success: true,
        message: "No organization found for id " + id,
      });
    } else {
      return {
        success: true,
        message: "Retrieved organization details successfully",
        data: result,
      };
    }
  }
}
