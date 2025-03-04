import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { Subscription } from "src/shared/interfaces/org";
import { ResponseWithOptionalData, SessionObject } from "src/shared/interfaces";
import { UserService } from "src/user/user.service";

@Controller("subscriptions")
export class SubscriptionsController {
  private logger = new CustomLogger(SubscriptionsController.name);
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly userService: UserService,
  ) {}

  @Get(":orgId")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgSubscription(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<Subscription>> {
    this.logger.log(`/subscriptions/${orgId} ${address}`);
    const owner = await this.userService.findOrgOwnerProfileByOrgId(orgId);
    if (owner.wallet === address) {
      return this.subscriptionsService.getSubscriptionInfo(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Get(":orgId/renew")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async renewOrgSubscription(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/renew ${address}`);
    const owner = await this.userService.findOrgOwnerProfileByOrgId(orgId);
    if (owner.wallet === address) {
      return this.subscriptionsService.initiateSubscriptionRenewal(
        address,
        orgId,
      );
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }
}
