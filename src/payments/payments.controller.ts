import { Body, Controller, Headers, Post, Res } from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PaymentsService } from "./payments.service";
import { PaymentEvent, PaymentEventData } from "./dto/webhook-data.dto";
import { JobsService } from "src/jobs/jobs.service";
import { addDays } from "date-fns";
import { Response } from "express";

@Controller("payments")
export class PaymentsController {
  private logger = new CustomLogger(PaymentsController.name);
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly jobsService: JobsService,
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
        const job = await this.jobsService.getJobDetailsByUuid(
          event.data.metadata.jobId,
          undefined,
        );
        if (job) {
          const isAlreadyPromoted = job.featured;
          if (isAlreadyPromoted) {
            this.logger.log(
              `Job ${job.shortUUID} is already promoted, extending feature duration...`,
            );
            await this.jobsService.makeJobFeatured({
              shortUUID: job.shortUUID,
              startDate: new Date(job.featureStartDate).toISOString(),
              endDate: addDays(job.featureEndDate, 7).toISOString(),
            });
          } else {
            this.logger.log(
              `Promoting job ${job.shortUUID} to featured status for a week...`,
            );
            await this.jobsService.makeJobFeatured({
              shortUUID: job.shortUUID,
              startDate: new Date().toISOString(),
              endDate: addDays(new Date(), 7).toISOString(),
            });
          }
          this.logger.log(`Job ${job.shortUUID} promoted successfully`);
        } else {
          this.logger.error(
            `Job ${event.data.metadata.jobId} could not be promoted because it does not exist`,
          );
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
