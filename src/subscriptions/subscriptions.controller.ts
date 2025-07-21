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
  SubscriptionMember,
} from "src/shared/interfaces/org";
import {
  data,
  ResponseWithOptionalData,
  SessionObject,
} from "src/shared/interfaces";
import { UserService } from "src/user/user.service";
import { now } from "lodash";
import { subMonths } from "date-fns";
import { StripeService } from "src/stripe/stripe.service";
import { ChangeSubscriptionInput } from "./dto/change-subscription.input";
import Stripe from "stripe";

@Controller("subscriptions")
export class SubscriptionsController {
  private logger = new CustomLogger(SubscriptionsController.name);
  constructor(
    private readonly userService: UserService,
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get(":orgId")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async getOrgSubscription(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<Subscription>> {
    this.logger.log(`/subscriptions/${orgId} ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.getSubscriptionInfoByOrgId(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Get(":orgId/members")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgSubscriptionMembers(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<SubscriptionMember[]>> {
    this.logger.log(`/subscriptions/${orgId}/members ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.subscriptionsService.getOrgSubscriptionMembers(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Get(":orgId/payments")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
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

  @Get(":orgId/payg/:service/usage")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgPaygUsageData(
    @Param("orgId") orgId: string,
    @Param("service") service: MeteredService,
    @Session() { address }: SessionObject,
    @Query("epochStart") epochStart: number,
    @Query("epochEnd") epochEnd: number,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: number,
    @Query("valueGroupingWindow")
    valueGroupingWindow?: Stripe.Billing.MeterListEventSummariesParams.ValueGroupingWindow,
  ): Promise<ResponseWithOptionalData<QuotaUsage[]>> {
    this.logger.log(`/subscriptions/${orgId}/payg/${service}/usage ${address}`);

    if (!epochStart || !epochEnd) {
      return {
        success: false,
        message: "Must specify epochStart and epochEnd",
      };
    }

    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription) {
        return this.stripeService.getMeteredServiceUsage(
          subscription.externalId,
          service,
          epochStart ?? subMonths(subscription.expiryTimestamp, 2).getTime(),
          epochEnd ?? now(),
          cursor,
          limit,
          valueGroupingWindow,
        );
      }
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }

  @Get(":orgId/quota/usage")
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
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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

  @Get(":orgId/quota/usage/summary")
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
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
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
          data: Array.from(availableCredits).map(x => ({
            service: x[0],
            totalUsage: usage.get(x[0]) ?? 0,
            availableCredits: x[1],
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

  @Get(":orgId/invoices")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async getOrgInvoices(
    @Param("orgId") orgId: string,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<Stripe.Invoice[]>> {
    this.logger.log(`/subscriptions/${orgId}/invoices ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription.externalId) {
        return this.stripeService.getCustomerInvoices(subscription.externalId);
      } else {
        return {
          success: false,
          message: "Subscription not found",
        };
      }
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
    @Body() body: ChangeSubscriptionInput,
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/subscriptions/${orgId}/change ${address}`);
    const owner = data(
      await this.userService.findOrgOwnerProfileByOrgId(orgId),
    );
    if (owner?.wallet === address) {
      return this.stripeService.initiateSubscriptionChange(
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
      return this.stripeService.resumeSubscription(orgId);
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
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription.externalId) {
        return this.stripeService.cancelSubscription(subscription.externalId);
      } else {
        return {
          success: false,
          message: "Subscription not found",
        };
      }
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
      await this.stripeService.deleteSubscription(orgId);
      return this.subscriptionsService.resetSubscriptionState(orgId);
    } else {
      throw new UnauthorizedException({
        success: false,
        message: "You are not the owner of this organization",
      });
    }
  }
}
