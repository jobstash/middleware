import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Headers,
  Query,
  ValidationPipe,
  BadRequestException,
  UseInterceptors,
} from "@nestjs/common";
import { EcosystemsService } from "./ecosystems.service";
import { CreateEcosystemDto } from "./dto/create-ecosystem.dto";
import { UpdateEcosystemDto } from "./dto/update-ecosystem.dto";
import {
  ApiOkResponse,
  getSchemaPath,
  ApiUnprocessableEntityResponse,
  ApiHeader,
} from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CACHE_DURATION,
  CheckWalletPermissions,
  ECOSYSTEM_HEADER,
} from "src/shared/constants";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  data,
  EcosystemJobListResult,
  Organization,
  OrganizationEcosystem,
  OrganizationEcosystemWithOrgs,
  PaginatedData,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
} from "src/shared/interfaces";
import { Permissions, Session } from "src/shared/decorators";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "src/user/user.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { UpdateEcosystemOrgsDto } from "./dto/update-ecosystem-orgs.dto";
import { EcosystemJobListParams } from "./dto/ecosystem-job-list.input";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("ecosystems")
export class EcosystemsController {
  private logger = new CustomLogger(EcosystemsController.name);
  constructor(
    private readonly userService: UserService,
    private readonly ecosystemsService: EcosystemsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get("/jobs")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiHeader({
    name: ECOSYSTEM_HEADER,
    required: true,
    description: "Header to tailor the response for a specific ecosystem",
  })
  @ApiOkResponse({
    description: "Returns jobs from orgs in an ecosystem",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(EcosystemJobListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the ecosystem jobs on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async getEcosystemJobs(
    @Session() session: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: EcosystemJobListParams,
  ): Promise<PaginatedData<EcosystemJobListResult>> {
    const orgId = await this.userService.findOrgIdByMemberUserWallet(
      session.address,
    );
    console.log(orgId);
    const ecosystem = data(await this.findAll(orgId, session))[0];
    if (!ecosystem) {
      throw new BadRequestException({
        success: false,
        message: "You must provide an ecosystem to fetch jobs from",
      });
    } else {
      const enrichedParams = {
        ...params,
        ecosystemHeader: ecosystem.normalizedName,
      };
      return this.ecosystemsService.getJobsListWithSearch(enrichedParams);
    }
  }

  @Post(":orgId")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Creates an ecosystem for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the organization ecosystem on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async create(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
    @Body() createEcosystemDto: CreateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    this.logger.log(
      `POST /ecosystems/create ${JSON.stringify(
        createEcosystemDto,
      )} from ${address}`,
    );
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfo(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    if (!isMember) {
      return {
        success: false,
        message: "You are not a member of this organization",
      };
    }
    return this.ecosystemsService.create(orgId, createEcosystemDto);
  }

  @Get(":orgId")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Fetches all ecosystems for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the organization ecosystems from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findAll(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem[]>> {
    this.logger.log(`GET /ecosystems/${orgId} from ${address}`);
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfo(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    if (!isMember) {
      return {
        success: false,
        message: "You are not a member of this organization",
      };
    }
    return this.ecosystemsService.findAll(orgId);
  }

  @Get(":orgId/:idOrSlug")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Fetches details for an ecosystem owned by an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the organization ecosystem from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findOne(
    @Param("orgId") orgId: string,
    @Param("idOrSlug") idOrSlug: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs>> {
    this.logger.log(`GET /ecosystems/${orgId}/${idOrSlug} from ${address}`);
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfo(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    if (!isMember) {
      return {
        success: false,
        message: "You are not a member of this organization",
      };
    }
    return this.ecosystemsService.findOne(orgId, idOrSlug);
  }

  @Put(":orgId/:idOrSlug")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description:
      "Updates member orgs for an ecosystem owned by an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the member orgs for the ecosystem on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateEcosystemOrgs(
    @Param("orgId") orgId: string,
    @Param("idOrSlug") idOrSlug: string,
    @Session() { address }: SessionObject,
    @Body() updateEcosystemDto: UpdateEcosystemOrgsDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs>> {
    this.logger.log(
      `PUT /ecosystems/${orgId}/${idOrSlug} ${JSON.stringify(
        updateEcosystemDto,
      )} from ${address}`,
    );
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfo(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    if (!isMember) {
      return {
        success: false,
        message: "You are not a member of this organization",
      };
    }
    return this.ecosystemsService.updateEcosystemOrgs(
      orgId,
      idOrSlug,
      updateEcosystemDto,
    );
  }

  @Patch(":orgId/:idOrSlug")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Updates details for an ecosystem owned by an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the organization ecosystem on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async update(
    @Param("orgId") orgId: string,
    @Param("idOrSlug") idOrSlug: string,
    @Session() { address }: SessionObject,
    @Body() updateEcosystemDto: UpdateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    this.logger.log(
      `PATCH /ecosystems/${orgId}/${idOrSlug} ${JSON.stringify(
        updateEcosystemDto,
      )} from ${address}`,
    );
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfo(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    if (!isMember) {
      return {
        success: false,
        message: "You are not a member of this organization",
      };
    }
    return this.ecosystemsService.update(orgId, idOrSlug, updateEcosystemDto);
  }

  @Delete(":orgId/:idOrSlug")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Deletes an ecosystem owned by an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Organization),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong deleting the organization ecosystem on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async remove(
    @Param("orgId") orgId: string,
    @Param("idOrSlug") idOrSlug: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`DELETE /ecosystems/${orgId}/${idOrSlug} from ${address}`);
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfo(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    if (!isMember) {
      return {
        success: false,
        message: "You are not a member of this organization",
      };
    }
    return this.ecosystemsService.remove(orgId, idOrSlug);
  }
}
