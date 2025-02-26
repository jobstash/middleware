import { Body, Controller, Headers, Post, Res } from "@nestjs/common";
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
    @Res({ passthrough: true }) res: Response,
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
      if (event.type === "charge:confirmed") {
        switch (event.data.metadata.action) {
          case "job-promotion":
            this.logger.log(`Handling job promotion webhook event`);
            const shortUUID = (
              JSON.parse(event.data.metadata.calldata) as JobPromotionMetadata
            ).shortUUID;
            await this.paymentsService.handleJobPromotion(
              shortUUID,
              this.jobsService,
            );
            break;
          case "new-subscription":
            this.logger.log(`Handling new subscription webhook event`);
            const subscriptionMetadata = JSON.parse(
              event.data.metadata.calldata,
            ) as SubscriptionMetadata;
            await this.paymentsService.handleNewSubscription(
              subscriptionMetadata,
              event.data.metadata.action,
              this.subscriptionsService,
            );
            break;
          default:
            this.logger.warn(
              `Unsupported or unimplemented webhook event metadata action: ${event.data.metadata.action}`,
            );
            break;
        }
      } else {
        this.logger.log(body);
        this.logger.warn(`Unsupported webhook event type: ${event.type}`);
      }
      res.status(200).send("OK");
    } else {
      this.logger.warn("Invalid webhook call");
      res.status(401).send("Unauthorized");
    }
  }
}
