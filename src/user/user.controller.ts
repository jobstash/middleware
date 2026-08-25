import {
  Body,
  Controller,
  BadRequestException,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
  Param,
  Delete,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { Permissions, Session } from "src/shared/decorators";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import {
  AdjacentRepo,
  EcosystemActivation,
  ResponseWithNoData,
  UserProfile,
  SessionObject,
  ResponseWithOptionalData,
  data,
  TalentList,
  TalentListWithUsers,
  TalentPoolCandidate,
  TalentPoolData,
  AgencyCandidateReport,
  AgencyCandidateReportSummary,
  CandidateReport,
} from "src/shared/interfaces";
import {
  GetAvailableUsersAdminInput,
  GetAvailableUsersInput,
} from "./dto/get-available-users.input";
import { ApiKeyGuard } from "src/auth/api-key.guard";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { UserWorkHistory } from "src/shared/interfaces/user/user-work-history.interface";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { AddUserNoteInput } from "./dto/add-user-note.dto";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { NewSubscriptionInput } from "src/subscriptions/dto/new-subscription.input";
import { PermissionService } from "./permission.service";
import { UpdateThreatIntelAccessDto } from "./dto/update-threat-intel-access.dto";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { StripeService } from "src/stripe/stripe.service";
import { UpdateTalentListInput } from "./dto/update-talent-list.input";
import { CreateTalentListInput } from "./dto/create-talent-list.input";
import { UpdateTalentListNameInput } from "./dto/update-talent-list-name.input";
import { AccessWorkspacesService } from "src/access-workspaces/access-workspaces.service";
import { responseSchemaWrapper } from "src/shared/helpers";

@Controller("users")
@ApiExtraModels(
  TalentPoolData,
  TalentPoolCandidate,
  AgencyCandidateReport,
  AgencyCandidateReportSummary,
)
export class UserController {
  private logger = new CustomLogger(UserController.name);
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionsService,
    private readonly permissionService: PermissionService,
    private readonly accessWorkspaces: AccessWorkspacesService,
  ) {}

  @Get("threat-intel-access")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async getThreatIntelAccess(
    @Query("query") rawQuery?: string,
    @Query("limit") rawLimit?: string,
    @Query("scope") rawScope?: string,
  ): Promise<
    Array<{
      wallet: string;
      name: string | null;
      email: string | null;
      github: string | null;
      hasAccess: boolean;
    }>
  > {
    await this.ensureThreatIntelPermission();
    const query = (rawQuery ?? "").trim();
    const scope = rawScope === "all" ? "all" : "granted";
    if (scope === "all" && query.length < 2) return [];
    const limit = Math.max(1, Math.min(Number(rawLimit) || 25, 100));
    return this.userService.searchThreatAccessUsers(
      query,
      limit,
      scope === "granted",
    );
  }

  @Put("threat-intel-access")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async grantThreatIntelAccess(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateThreatIntelAccessDto,
  ): Promise<ResponseWithNoData> {
    await this.ensureThreatIntelPermission();
    const alreadyGranted = await this.permissionService.userHasPermission(
      body.wallet,
      CheckWalletPermissions.THREAT_INTEL,
    );
    const permission = await this.permissionService.grantUserPermission(
      body.wallet,
      CheckWalletPermissions.THREAT_INTEL,
    );
    if (!permission.success) return permission;

    const verification =
      await this.profileService.ensureThreatIntelOrganizationVerification(
        body.wallet,
      );
    if (!verification.success) {
      if (!alreadyGranted) {
        await this.permissionService.revokeUserPermission(
          body.wallet,
          CheckWalletPermissions.THREAT_INTEL,
        );
      }
      return verification;
    }
    return {
      success: true,
      message: alreadyGranted
        ? "User already has threat-intelligence access and is verified for JobStash"
        : "Threat-intelligence access granted and user verified for JobStash",
    };
  }

  @Delete("threat-intel-access")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async revokeThreatIntelAccess(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateThreatIntelAccessDto,
  ): Promise<ResponseWithNoData> {
    await this.ensureThreatIntelPermission();
    return this.permissionService.revokeUserPermission(
      body.wallet,
      CheckWalletPermissions.THREAT_INTEL,
    );
  }

  private async ensureThreatIntelPermission(): Promise<void> {
    if (
      !(await this.permissionService.find(CheckWalletPermissions.THREAT_INTEL))
    ) {
      await this.permissionService.create({
        name: CheckWalletPermissions.THREAT_INTEL,
      });
    }
  }

  @Get("")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async getAllUsers(): Promise<UserProfile[]> {
    this.logger.log("/users");
    return this.userService.findAll();
  }

  @Get("admin/available")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  @ApiOkResponse({
    description:
      "Returns opted-in candidates with one verified contact email to a superuser",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TalentPoolData) }),
  })
  async getUsersAvailableForWorkAsSuperadmin(
    @Query(new ValidationPipe({ transform: true }))
    params: GetAvailableUsersAdminInput,
  ): Promise<ResponseWithOptionalData<TalentPoolData>> {
    return this.userService.getUsersAvailableForWork(params);
  }

  @Get("admin/available/:wallet/report")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  @ApiOkResponse({
    description: "Returns an opted-in candidate report to a superuser",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(AgencyCandidateReport),
    }),
  })
  async getAgencyCandidateReportAsSuperadmin(
    @Param("wallet") wallet: string,
  ): Promise<ResponseWithOptionalData<AgencyCandidateReport>> {
    return this.userService.getAgencyCandidateReport(wallet);
  }

  @Get("available")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  @ApiOkResponse({
    description:
      "Returns opted-in candidates with one verified contact email to an entitled Agency workspace",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TalentPoolData) }),
  })
  async getUsersAvailableForWork(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: GetAvailableUsersInput,
  ): Promise<ResponseWithOptionalData<TalentPoolData>> {
    if (!address) {
      throw new ForbiddenException({
        success: false,
        message: "Access denied",
      });
    }
    await this.accessWorkspaces.requireAgencyEntitlement(
      params.workspaceId,
      address,
    );
    this.logger.log(`/users/available`);
    return this.userService.getUsersAvailableForWork(params);
  }

  @Get("available/top")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  @ApiOkResponse({
    description:
      "Returns up to 50 opted-in candidates with one verified contact email to an entitled Agency workspace",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TalentPoolData) }),
  })
  async getTopUsers(
    @Session() { address }: SessionObject,
    @Query("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<ResponseWithOptionalData<TalentPoolData>> {
    if (!address) {
      throw new ForbiddenException({
        success: false,
        message: "Access denied",
      });
    }
    await this.accessWorkspaces.requireAgencyEntitlement(workspaceId, address);
    this.logger.log(`/users/available/top`);
    return this.userService.getTopUsers();
  }

  @Get("available/:wallet/report")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  @ApiOkResponse({
    description:
      "Returns a candidate report for an opted-in candidate to an entitled Agency workspace member",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(AgencyCandidateReport),
    }),
  })
  async getAgencyCandidateReport(
    @Session() { address }: SessionObject,
    @Param("wallet") wallet: string,
    @Query("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<ResponseWithOptionalData<AgencyCandidateReport>> {
    if (!address) {
      throw new ForbiddenException({
        success: false,
        message: "Access denied",
      });
    }
    await this.accessWorkspaces.requireAgencyEntitlement(workspaceId, address);
    return this.userService.getAgencyCandidateReport(wallet);
  }

  @Get("admin/candidate-report/:github")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  async getCandidateReportAsSuperadmin(
    @Param("github") github: string,
    @Query("wallet") wallet?: string,
  ): Promise<ResponseWithOptionalData<CandidateReport>> {
    return this.scorerService.getCandidateReport(github, wallet);
  }

  @Get("candidate-report/:github")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @UseInterceptors(new CacheHeaderInterceptor({ mode: "no-store" }))
  async getCandidateReport(
    @Session() { address }: SessionObject,
    @Param("github") github: string,
    @Query("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Query("wallet") wallet?: string,
  ): Promise<ResponseWithOptionalData<CandidateReport>> {
    if (!address) {
      throw new ForbiddenException({
        success: false,
        message: "Access denied",
      });
    }
    await this.accessWorkspaces.requireAgencyEntitlement(workspaceId, address);
    return this.scorerService.getCandidateReport(github, wallet);
  }

  @Get("/org/:id/talent-lists")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async getTalentLists(
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
  ): Promise<ResponseWithOptionalData<TalentList[]>> {
    this.logger.log(`/users/org/:id/talent-lists`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.userService.getTalentLists(orgId);
  }

  @Get("/org/:id/talent-lists/:list")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async getTalentList(
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
    @Param("list") list: string,
  ): Promise<ResponseWithOptionalData<TalentListWithUsers>> {
    this.logger.log(`/users/org/:id/talent-list/:list`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.userService.getTalentList(orgId, list);
  }

  @Post("/org/:id/talent-lists")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async createTalentList(
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
    @Body() body: CreateTalentListInput,
  ): Promise<ResponseWithOptionalData<TalentList>> {
    this.logger.log(`/users/org/:id/talent-lists`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.userService.createTalentList(orgId, body);
  }

  @Post("/org/:id/talent-lists/:list")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async updateTalentListName(
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
    @Param("list") list: string,
    @Body() body: UpdateTalentListNameInput,
  ): Promise<ResponseWithOptionalData<TalentList>> {
    this.logger.log(`/users/org/:id/talent-lists/:list`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.userService.updateTalentList(orgId, list, body);
  }

  @Put("/org/:id/talent-lists/:list")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async updateOrgTalentList(
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
    @Param("list") list: string,
    @Body() body: UpdateTalentListInput,
  ): Promise<ResponseWithOptionalData<TalentListWithUsers>> {
    this.logger.log(`/users/org/:id/talent-lists/:list/talent`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.userService.updateOrgTalentList(orgId, list, body);
  }

  @Delete("/org/:id/talent-lists/:list")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async deleteTalentList(
    @Session() { address }: SessionObject,
    @Param("id") orgId: string,
    @Param("list") list: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/users/org/:id/talent-lists/:list`);
    if (!(await this.userService.isOrgMember(address, orgId))) {
      throw new ForbiddenException({
        success: false,
        message: "You are not authorized to access this resource",
      });
    }
    return this.userService.deleteTalentList(orgId, list);
  }

  @Get("ecosystem-activations")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER],
  )
  async getEcosystemActivationsForWallets(
    @Query("wallets") wallets: string,
  ): Promise<
    ResponseWithOptionalData<
      { wallet: string; ecosystemActivations: EcosystemActivation[] }[]
    >
  > {
    this.logger.log(`/users/ecosystem-activations`);
    return this.scorerService.getEcosystemActivationsForWallets(
      wallets.split(","),
    );
  }

  @Post("signup")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  async signupToOrg(
    @Body() body: NewSubscriptionInput,
    @Session() { address }: SessionObject,
    @Query("flag") flag: string | undefined,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(
      `/users/signup?flag=${flag} ${address}, ${JSON.stringify(body)}`,
    );
    const hasOwner = await this.userService.orgHasOwner(body.orgId);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(body.orgId),
    );
    if (!hasOwner || owner?.wallet === address) {
      const verifications =
        data(await this.profileService.getUserVerifications(address)) ?? [];
      const verified = verifications.find(
        x => x.id === body.orgId && x.credential === "email",
      );
      if (verified) {
        if (body.jobstash) {
          return this.stripeService.initiateNewSubscription({
            wallet: address,
            email: verified.account,
            dto: body,
            flag,
          });
        } else {
          throw new BadRequestException({
            success: false,
            message: "You must specify a subscription plan",
          });
        }
      } else {
        throw new BadRequestException({
          success: false,
          message: "Invalid orgId or user not verified",
        });
      }
    } else {
      const memberships = data(
        await this.profileService.getUserVerifications(address),
      ).filter(x => x.isMember);
      if (memberships.find(x => x.id === body.orgId)) {
        throw new BadRequestException({
          success: false,
          message: "User is already a member of this organization",
        });
      } else {
        const subscription = data(
          await this.subscriptionService.getSubscriptionInfoByOrgId(body.orgId),
        );
        return this.userService.addOrgUser(body.orgId, address, subscription);
      }
    }
  }

  @Get("/work-history")
  @UseGuards(ApiKeyGuard)
  @ApiOkResponse({
    description: "Returns the work history for the passed github accounts ",
    type: Array<{
      user: string;
      workHistory: UserWorkHistory[];
    }>,
  })
  async getWorkHistory(@Query("users") users: string): Promise<
    {
      username: string | null;
      wallets: {
        address: string;
        ecosystemActivations: EcosystemActivation[];
      }[];
      cryptoNative: boolean;
      workHistory: UserWorkHistory[];
      adjacentRepos: AdjacentRepo[];
    }[]
  > {
    this.logger.log(`/users/work-history`);
    return this.scorerService.getUserWorkHistories(
      users.split(",").map(x => ({ github: x, wallets: [] })),
    );
  }

  @Post("note")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER],
  )
  async addUserNote(
    @Session() { address }: SessionObject,
    @Body() body: AddUserNoteInput,
  ): Promise<ResponseWithNoData> {
    if (address) {
      const orgId = address
        ? await this.userService.findOrgIdByMemberUserWallet(address)
        : null;
      this.logger.log(`/users/note ${address}`);
      const subscription = data(
        await this.subscriptionService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription?.canAccessService("stashPool")) {
        return this.userService.addUserNote(body.wallet, body.note, orgId);
      } else {
        throw new ForbiddenException({
          success: false,
          message:
            "Organization does not have an active or valid subscription to use this service",
        });
      }
    } else {
      throw new ForbiddenException({
        success: false,
        message: "Access denied",
      });
    }
  }
}
