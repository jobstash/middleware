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
  Query,
  ValidationPipe,
  BadRequestException,
  UseInterceptors,
  ForbiddenException,
  Headers,
} from "@nestjs/common";
import { EcosystemsService } from "./ecosystems.service";
import { CreateEcosystemDto } from "./dto/create-ecosystem.dto";
import { UpdateEcosystemDto } from "./dto/update-ecosystem.dto";
import {
  ApiOkResponse,
  getSchemaPath,
  ApiUnprocessableEntityResponse,
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
  EcosystemJobFilterConfigs,
  EcosystemJobListResult,
  Organization,
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
import { StoredFilter } from "src/shared/interfaces/stored-filter.interface";
import { CreateStoredFilterDto } from "./dto/create-stored-filter.dto";
import { UpdateStoredFilterDto } from "./dto/update-stored-filter.dto";
import {
  OrganizationEcosystem,
  OrganizationEcosystemWithOrgs,
} from "src/shared/interfaces/org";

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
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<PaginatedData<EcosystemJobListResult>> {
    this.logger.log(
      `GET /ecosystems/jobs ${JSON.stringify(params)} from ${session.address}`,
    );
    const orgId = await this.userService.findOrgIdByMemberUserWallet(
      session.address,
    );
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription.isActive()) {
      throw new ForbiddenException({
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      });
    }
    const allEcos = data(await this.findAll(orgId, session));
    const targets = ecosystem
      ? allEcos.filter(x => x.normalizedName === ecosystem)
      : allEcos;
    if (!targets.length) {
      throw new BadRequestException({
        success: false,
        message: "You are not allowed to access this resource",
      });
    } else {
      const enrichedParams = {
        ...params,
        ecosystems: targets.map(x => x.normalizedName),
      };
      return this.ecosystemsService.getJobsListWithSearch(enrichedParams);
    }
  }

  @Get("/jobs/filters")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Returns job filters for orgs in an ecosystem",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(EcosystemJobFilterConfigs),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the ecosystem jobs on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async getEcosystemJobFilters(
    @Session() session: SessionObject,
    @Headers(ECOSYSTEM_HEADER) ecosystem: string | undefined,
  ): Promise<EcosystemJobFilterConfigs> {
    this.logger.log(`GET /ecosystems/jobs/filters from ${session.address}`);
    const orgId = await this.userService.findOrgIdByMemberUserWallet(
      session.address,
    );
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription.isActive()) {
      throw new ForbiddenException({
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      });
    }
    const allEcos = data(await this.findAll(orgId, session));
    const targets = ecosystem
      ? allEcos.filter(x => x.normalizedName === ecosystem)
      : allEcos;
    if (!targets.length) {
      throw new BadRequestException({
        success: false,
        message: "You are not allowed to access this resource",
      });
    } else {
      return this.ecosystemsService.getFilterConfigs(
        targets.map(x => x.normalizedName),
      );
    }
  }

  @Post("jobs/filters/stored")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Creates an stored filter config for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(StoredFilter),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the stored filter config on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async createStoredFilter(
    @Session() { address }: SessionObject,
    @Body() createStoredFilterDto: CreateStoredFilterDto,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    this.logger.log(
      `POST /ecosystems/jobs/filters/stored ${JSON.stringify(
        createStoredFilterDto,
      )} from ${address}`,
    );
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    return this.ecosystemsService.createStoredFilter(
      orgId,
      address,
      createStoredFilterDto,
    );
  }

  @Get("jobs/filters/stored")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Fetches all stored filter configs for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(StoredFilter),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the stored filters from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findAllStoredFilters(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<StoredFilter[]>> {
    this.logger.log(`GET /ecosystems/jobs/filters/stored from ${address}`);
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    return this.ecosystemsService.findAllStoredFilters(orgId, address);
  }

  @Put("jobs/filters/stored/:id")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Updates a stored filter owned by an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(StoredFilter),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the stored filter from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateStoredFilterById(
    @Param("id") id: string,
    @Session() { address }: SessionObject,
    @Body() updateStoredFilterDto: UpdateStoredFilterDto,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    this.logger.log(
      `PUT /ecosystems/jobs/filters/stored/${id} from ${address}`,
    );
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    return this.ecosystemsService.updateStoredFilter(
      orgId,
      address,
      id,
      updateStoredFilterDto,
    );
  }

  @Delete("jobs/filters/stored/:id")
  @UseGuards(PBACGuard)
  @Permissions([
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  ])
  @ApiOkResponse({
    description: "Deletes a stored filter owned by an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(StoredFilter),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong deleting the stored filter on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async removeStoredFilter(
    @Param("id") id: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithNoData> {
    this.logger.log(
      `DELETE /ecosystems/jobs/filters/stored/${id} from ${address}`,
    );
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription.isActive()) {
      return {
        success: false,
        message:
          "Organization does not have an active or valid subscription to use this service",
      };
    }
    return this.ecosystemsService.removeStoredFilter(orgId, address, id);
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
      `POST /ecosystems/${orgId} ${JSON.stringify(
        createEcosystemDto,
      )} from ${address}`,
    );
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs[]>> {
    this.logger.log(`GET /ecosystems/${orgId} from ${address}`);
    const isMember = await this.userService.isOrgMember(address, orgId);
    const subscription = data(
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
    );
    if (!subscription?.isActive()) {
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
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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
      await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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
