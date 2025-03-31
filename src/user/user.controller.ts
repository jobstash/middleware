import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { Permissions, Session } from "src/shared/decorators";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import {
  AdjacentRepo,
  UserAvailableForWork,
  EcosystemActivation,
  ResponseWithNoData,
  UserProfile,
  SessionObject,
  ResponseWithOptionalData,
  data,
} from "src/shared/interfaces";
import { GetAvailableUsersInput } from "./dto/get-available-users.input";
import { ApiKeyGuard } from "src/auth/api-key.guard";
import { ApiOkResponse } from "@nestjs/swagger";
import { UserWorkHistory } from "src/shared/interfaces/user/user-work-history.interface";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { AddUserNoteInput } from "./dto/add-user-note.dto";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { NewSubscriptionInput } from "src/subscriptions/new-subscription.input";

@Controller("users")
export class UserController {
  private logger = new CustomLogger(UserController.name);
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
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
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
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
        await this.subscriptionService.getSubscriptionInfo(orgId),
      );
      if (subscription?.canAccessService("stashPool")) {
        return this.userService.getUsersAvailableForWork(params, orgId);
      } else {
        return {
          success: false,
          message:
            "Organization does not have an active or valid subscription to use this service",
        };
      }
    } else {
      return {
        success: false,
        message: "Access denied",
      };
    }
  }

  @Post("signup")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  async signupToOrg(
    @Body() body: NewSubscriptionInput,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/users/signup ${address}, ${JSON.stringify(body)}`);
    const hasOwner = await this.userService.orgHasOwner(body.orgId);
    if (!hasOwner) {
      const verifications =
        data(await this.profileService.getUserVerifications(address)) ?? [];
      const verified = verifications.find(
        x => x.id === body.orgId && x.credential === "email",
      );
      if (verified) {
        if (body.jobstash) {
          return this.subscriptionService.initiateNewSubscription({
            wallet: address,
            email: verified.account,
            dto: body,
          });
        } else {
          return {
            success: false,
            message: "You must specify a subscription plan",
          };
        }
      } else {
        return {
          success: false,
          message: "Invalid orgId or user not verified",
        };
      }
    } else {
      const memberships = data(
        await this.profileService.getUserVerifications(address),
      ).filter(x => x.isMember);
      if (memberships.find(x => x.id === body.orgId)) {
        return {
          success: false,
          message: "User is already a member of this organization",
        };
      } else {
        const subscription = data(
          await this.subscriptionService.getSubscriptionInfo(body.orgId),
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
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
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
        await this.subscriptionService.getSubscriptionInfo(orgId),
      );
      if (subscription?.canAccessService("stashPool")) {
        return this.userService.addUserNote(body.wallet, body.note, orgId);
      } else {
        return {
          success: false,
          message:
            "Organization does not have an active or valid subscription to use this service",
        };
      }
    } else {
      return {
        success: false,
        message: "Access denied",
      };
    }
  }
}
