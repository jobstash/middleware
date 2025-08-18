import {
  Body,
  Controller,
  BadRequestException,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
  // UseInterceptors,
  ValidationPipe,
  Param,
  Delete,
  Put,
} from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { Permissions, Session } from "src/shared/decorators";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  // CACHE_DURATION_15_MINUTES,
  CheckWalletPermissions,
} from "src/shared/constants";
import {
  AdjacentRepo,
  UserAvailableForWork,
  EcosystemActivation,
  ResponseWithNoData,
  UserProfile,
  SessionObject,
  ResponseWithOptionalData,
  data,
  TalentList,
  TalentListWithUsers,
} from "src/shared/interfaces";
import { GetAvailableUsersInput } from "./dto/get-available-users.input";
import { ApiKeyGuard } from "src/auth/api-key.guard";
import { ApiOkResponse } from "@nestjs/swagger";
import { UserWorkHistory } from "src/shared/interfaces/user/user-work-history.interface";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { AddUserNoteInput } from "./dto/add-user-note.dto";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { NewSubscriptionInput } from "src/subscriptions/dto/new-subscription.input";
// import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { StripeService } from "src/stripe/stripe.service";
import { UpdateTalentListInput } from "./dto/update-talent-list.input";
import { CreateTalentListInput } from "./dto/create-talent-list.input";
import { UpdateTalentListNameInput } from "./dto/update-talent-list-name.input";

@Controller("users")
export class UserController {
  private logger = new CustomLogger(UserController.name);
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionsService,
  ) {}

  @Get("")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async getAllUsers(): Promise<UserProfile[]> {
    this.logger.log("/users");
    return this.userService.findAll();
  }

  @Get("available")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER],
  )
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_15_MINUTES))
  async getUsersAvailableForWork(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: GetAvailableUsersInput,
  ): Promise<ResponseWithOptionalData<UserAvailableForWork[]>> {
    const orgId = address
      ? await this.userService.findOrgIdByMemberUserWallet(address)
      : null;
    if (orgId) {
      this.logger.log(`/users/available ${JSON.stringify(params)}`);
      const subscription = data(
        await this.subscriptionService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription?.canAccessService("stashPool")) {
        return this.userService.getUsersAvailableForWork(params, orgId);
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

  @Get("available/top")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER],
  )
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_15_MINUTES))
  async getTopUsers(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<UserAvailableForWork[]>> {
    const orgId = address
      ? await this.userService.findOrgIdByMemberUserWallet(address)
      : null;
    if (orgId) {
      this.logger.log(`/users/available/top`);
      return this.userService.getTopUsers(orgId);
    } else {
      throw new ForbiddenException({
        success: false,
        message: "Access denied",
      });
    }
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
    @Query("orgId") orgId: string | null,
  ): Promise<
    ResponseWithOptionalData<
      { wallet: string; ecosystemActivations: EcosystemActivation[] }[]
    >
  > {
    this.logger.log(`/users/ecosystem-activations`);
    return this.scorerService.getEcosystemActivationsForWallets(
      wallets.split(","),
      orgId,
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
