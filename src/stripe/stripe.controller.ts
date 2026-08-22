import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import { StripeService } from "./stripe.service";
import Stripe from "stripe";
import { Request } from "express";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";

@Controller("stripe")
export class StripeController {
  private readonly logger = new CustomLogger(StripeController.name);
  constructor(
    @Inject("STRIPE_CLIENT")
    private readonly stripe: Stripe,
    @Inject("STRIPE_WEBHOOK_SECRET")
    private readonly webhookSecret: string,
    private readonly stripeService: StripeService,
  ) {}

  @Post("agency-workspaces/:workspaceId/checkout")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  async createAgencyCheckout(
    @Param("workspaceId") workspaceId: string,
    @Session() session: SessionObject,
  ): Promise<{
    success: true;
    message: string;
    data: { id: string; url: string };
  }> {
    return {
      success: true,
      message: "Agency checkout created successfully",
      data: await this.stripeService.createAgencyCheckout(
        workspaceId,
        session.address!,
      ),
    };
  }

  @Post("webhook")
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.webhookSecret,
      );
      this.logger.log(`Received webhook event: ${event.type}`);
      switch (event.type) {
        case "checkout.session.completed":
          await this.stripeService.handleCheckoutSessionCompleted(
            event.data.object,
            event.id,
          );
          break;

        case "checkout.session.async_payment_failed":
        case "checkout.session.expired":
          this.logger.warn(`Checkout session did not complete: ${event.type}`);
          break;

        case "invoice.payment_succeeded":
          await this.stripeService.handleInvoicePaymentSucceeded(event);
          break;

        case "customer.subscription.updated":
          await this.stripeService.handleStripeSubscriptionUpdated(event);
          break;

        case "customer.subscription.deleted":
          await this.stripeService.handleStripeSubscriptionCanceled(event);
          break;

        default:
          this.logger.warn(
            `Unhandled Stripe webhook event type: ${event.type}`,
          );
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "webhook-validation",
          source: "stripe.controller",
        });
        scope.setExtra("input", req.body);
        Sentry.captureException(error);
      });
      this.logger.error(`StripeController::handleWebhook ${error.message}`);
      throw new BadRequestException({
        success: false,
        message: "Invalid webhook call",
      });
    }
  }
}
