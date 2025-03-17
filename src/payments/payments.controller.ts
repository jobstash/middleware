import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PaymentsService } from "./payments.service";
import {
  JobPromotionMetadata,
  PaymentEvent,
  PaymentEventData,
  SubscriptionMetadata,
} from "./dto/webhook-data.dto";
import { Response } from "express";
import { JobsService } from "src/jobs/jobs.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";

@Controller("payments")
export class PaymentsController {
  private logger = new CustomLogger(PaymentsController.name);
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly jobsService: JobsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Post("webhook")
  async handleWebhook(
    @Body() body: PaymentEvent,
    @Headers("X-CC-WEBHOOK-SIGNATURE") signature: string,
  ): Promise<void> {
    const isValidCall = await this.paymentsService.verifyWebhookSignature(
      JSON.stringify(body),
      signature,
    );
    if (isValidCall) {
      this.logger.log("Valid webhook call");
      const event =
        typeof body.event === "string"
          ? (JSON.parse(body.event) as PaymentEventData)
          : body.event;
      if (
        event.type === "charge:confirmed" ||
        event.type === "charge:pending"
      ) {
        switch (event.data.metadata.action) {
          case "job-promotion":
            this.logger.log(`Handling job promotion webhook event`);
            const shortUUID = (
              JSON.parse(event.data.metadata.calldata) as JobPromotionMetadata
            ).shortUUID;
            await this.jobsService.handleJobPromotion(shortUUID);
            break;
          case "new-subscription":
            this.logger.log(`Handling new subscription webhook event`);
            const newSubscriptionMetadata = JSON.parse(
              event.data.metadata.calldata,
            ) as SubscriptionMetadata;
            await this.subscriptionsService.createNewSubscription(
              newSubscriptionMetadata,
            );
            break;
          case "subscription-renewal":
            this.logger.log(`Handling subscription renewal webhook event`);
            const subscriptionRenewalMetadata = JSON.parse(
              event.data.metadata.calldata,
            ) as SubscriptionMetadata;
            await this.subscriptionsService.renewSubscription(
              subscriptionRenewalMetadata,
            );
            break;
          case "subscription-change":
            this.logger.log(`Handling subscription change webhook event`);
            const subscriptionUpgradeMetadata = JSON.parse(
              event.data.metadata.calldata,
            ) as SubscriptionMetadata;
            await this.subscriptionsService.changeSubscription(
              subscriptionUpgradeMetadata,
            );
            break;
          default:
            this.logger.warn(
              `Unsupported or unimplemented webhook event metadata action: ${event.data.metadata.action}`,
            );
            break;
        }
      } else {
        this.logger.warn(
          `Unsupported webhook event type: ${event.type} ${JSON.stringify(body)}`,
        );
      }
    } else {
      throw new BadRequestException({
        success: false,
        message: "Invalid webhook call",
      });
    }
  }
}
