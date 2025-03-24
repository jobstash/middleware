import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import {
  Subscription,
  Payment,
  QuotaUsage,
  MeteredService,
} from "src/shared/interfaces/org";
import {
  data,
  ResponseWithOptionalData,
  SessionObject,
} from "src/shared/interfaces";
import { UserService } from "src/user/user.service";
import { NewSubscriptionInput } from "./new-subscription.input";
import { now } from "lodash";
import { subMonths } from "date-fns";

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

  @Get(":orgId/payments")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgPayments(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<Payment[]>> {
    this.logger.log(`/subscriptions/${orgId}/payments ${address}`);

    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );

    if (owner?.wallet === address) {
      return this.subscriptionsService.getOrgPayments(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Get(":orgId/usage")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgUsageData(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
    @Query("epochStart") epochStart?: number,
    @Query("epochEnd") epochEnd?: number,
  ): Promise<ResponseWithOptionalData<QuotaUsage[]>> {
    this.logger.log(`/subscriptions/${orgId}/usage ${address}`);

    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfo(orgId),
      );
      if (subscription) {
        let usage: QuotaUsage[] = [];
        if (epochStart && epochEnd) {
          usage = subscription.getEpochUsage(epochStart, epochEnd);
        } else if (epochStart && !epochEnd) {
          usage = subscription.getEpochUsage(epochStart, now());
        } else if (!epochStart && epochEnd) {
          return {
            success: false,
            message: "Must specify epochStart if epochEnd is specified",
          };
        } else {
          usage = subscription.getCurrentEpochUsage();
        }
        return {
          success: true,
          message: "Retrieved organization usage",
          data: usage,
        };
      }
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Get(":orgId/usage/summary")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgUsageSummary(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
    @Query("epochStart") epochStart?: number,
    @Query("epochEnd") epochEnd?: number,
  ): Promise<
    ResponseWithOptionalData<
      {
        service: string;
        totalUsage: number;
        availableCredits: number;
      }[]
    >
  > {
    this.logger.log(`/subscriptions/${orgId}/usage/summary ${address}`);

    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfo(orgId),
      );
      if (subscription) {
        let usage: Map<MeteredService, number>;
        let availableCredits: Map<MeteredService, number>;
        if (epochStart && epochEnd) {
          usage = subscription.getEpochAggregateUsage(epochStart, epochEnd);
          availableCredits = subscription.getEpochAggregateAvailableCredits(
            epochStart,
            epochEnd,
          );
        } else if (epochStart && !epochEnd) {
          usage = subscription.getEpochAggregateUsage(epochStart, now());
          availableCredits = subscription.getEpochAggregateAvailableCredits(
            epochStart,
            now(),
          );
        } else if (!epochStart && epochEnd) {
          return {
            success: false,
            message: "Must specify epochStart if epochEnd is specified",
          };
        } else {
          usage = subscription.getCurrentEpochAggregateUsage();
          availableCredits = subscription.getEpochAggregateAvailableCredits(
            subMonths(subscription.expiryTimestamp, 2).getTime(),
            now(),
          );
        }
        return {
          success: true,
          message: "Retrieved organization usage",
          data: Array.from(usage).map(x => ({
            service: x[0],
            totalUsage: x[1],
            availableCredits: availableCredits.get(x[0]) ?? 0,
          })),
        };
      }
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
