import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AccountService } from "./account.service";
import {
  data,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
} from "src/shared/interfaces";
import { DelegateAccessInput } from "./dto/delegate-access.input";
import { AcceptDelegateAccessInput } from "./dto/accept-delegate-access.input";
import { RevokeDelegateAccessInput } from "./dto/revoke-delegate-access.input";
import { Permissions, Session } from "src/shared/decorators";
import { UserService } from "src/user/user.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { CheckWalletPermissions } from "src/shared/constants";
import { PBACGuard } from "../pbac.guard";
import { DelegateAccessRequest } from "src/shared/interfaces/org";
import { ProfileService } from "../profile/profile.service";

@Controller("account")
export class AccountController {
  constructor(
    private readonly userService: UserService,
    private readonly accountService: AccountService,
    private readonly profileService: ProfileService,
    private readonly subscriptionService: SubscriptionsService,
  ) {}

  @Get("delegate-access/requests")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ORG_MEMBER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  )
  async getDelegateAccessRequests(
    @Session() { address }: SessionObject,
    @Query("orgId") orgId: string,
  ): Promise<ResponseWithOptionalData<DelegateAccessRequest[]>> {
    if (!orgId) {
      return {
        success: false,
        message: "Org ID is required",
      };
    }
    const isMember = await this.userService.isOrgMember(address, orgId);
    if (!isMember) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }
    return this.accountService.getDelegateAccessRequests(orgId);
  }

  @Post("delegate-access/request")
  @UseGuards(PBACGuard)
  @Permissions(
    CheckWalletPermissions.USER,
    CheckWalletPermissions.ORG_MEMBER,
    CheckWalletPermissions.ECOSYSTEM_MANAGER,
  )
  async requestDelegateAccess(
    @Session() { address }: SessionObject,
    @Body() body: DelegateAccessInput,
  ): Promise<ResponseWithOptionalData<string>> {
    const fromOrgId =
      await this.userService.findOrgIdByMemberUserWallet(address);
    if (!fromOrgId) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }
    if (fromOrgId === body.toOrgId) {
      return {
        success: false,
        message: "You cannot delegate access to yourself",
      };
    }
    const subscription = data(
      await this.subscriptionService.getSubscriptionInfoByOrgId(fromOrgId),
    );
    if (!(await this.userService.isOrgMember(address, fromOrgId))) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }
    if (!subscription?.isActive()) {
      return {
        success: false,
        message:
          "Your organization does not have a valid or active subscription",
      };
    }
    return this.accountService.requestDelegateAccess(address, fromOrgId, body);
  }

  @Post("delegate-access/accept")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  async acceptDelegateAccessRequest(
    @Session() { address }: SessionObject,
    @Body() body: AcceptDelegateAccessInput,
  ): Promise<ResponseWithNoData> {
    const userVerifications = data(
      await this.profileService.getUserVerifications(address),
    );

    if (
      !userVerifications.some(
        verification =>
          verification.id === body.toOrgId &&
          verification.credential === "email",
      )
    ) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }

    return this.accountService.acceptDelegateAccessRequest(address, body);
  }

  @Post("delegate-access/revoke")
  @UseGuards(PBACGuard)
  @Permissions([CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER])
  async revokeDelegateAccess(
    @Session() { address }: SessionObject,
    @Body() body: RevokeDelegateAccessInput,
  ): Promise<ResponseWithNoData> {
    const isMemberFrom = await this.userService.isOrgMember(
      address,
      body.fromOrgId,
    );
    const isOwnerTo = await this.userService.isOrgOwner(address, body.toOrgId);

    if (!isMemberFrom && !isOwnerTo) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }

    return this.accountService.revokeDelegateAccess(address, body);
  }
}
