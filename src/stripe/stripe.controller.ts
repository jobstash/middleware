import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { StripeService } from "./stripe.service";
import Stripe from "stripe";
import { Request } from "express";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";

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
          );
          break;

        case "checkout.session.async_payment_failed":
        case "checkout.session.expired":
          this.logger.warn(`Checkout session did not complete: ${event.type}`);
          break;

        case "customer.subscription.updated":
          await this.stripeService.handleStripeSubscriptionUpdated(
            event.data.object,
          );
          break;

        case "customer.subscription.deleted":
          await this.stripeService.handleStripeSubscriptionDeleted(
            event.data.object,
          );
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
