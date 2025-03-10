import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { Subscription } from "src/shared/interfaces/org";
import {
  data,
  ResponseWithOptionalData,
  SessionObject,
} from "src/shared/interfaces";
import { UserService } from "src/user/user.service";
import { NewSubscriptionInput } from "./new-subscription.input";

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
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.getSubscriptionInfo(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Post(":orgId/renew")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async renewOrgSubscription(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/renew ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
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

  @Post(":orgId/change")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async changeOrgSubscription(
    @Param("orgId") orgId: string,
    @Body() body: NewSubscriptionInput,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/change ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.initiateSubscriptionChange(
        address,
        orgId,
        body,
      );
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Post(":orgId/reactivate")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async reactivateOrgSubscription(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/reactivate ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.reactivateSubscription(address, orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Post(":orgId/cancel")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async cancelOrgSubscription(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/cancel ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.cancelSubscription(address, orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Post(":orgId/reset")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async resetOrgSubscriptionState(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/reset ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.resetSubscriptionState(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }
}
