import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateCharge } from "./dto/create-charge.dto";
import { Charge } from "./dto/charge.dto";
import { AxiosError } from "axios";
import { ConfigService } from "@nestjs/config";
import { JobsService } from "src/jobs/jobs.service";
import { addDays } from "date-fns";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { Metadata, SubscriptionMetadata } from "./dto/webhook-data.dto";

@Injectable()
export class PaymentsService {
  private logger = new CustomLogger(PaymentsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createCharge(chargeData: CreateCharge): Promise<{
    id: string;
    url: string;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ data: Charge }>("charges", chargeData),
      );
      const data = response.data;
      return {
        id: data.data.id,
        url: data.data.hosted_url,
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Failed to create charge: ${JSON.stringify(error, null, 4)}`,
        );
      } else {
        this.logger.error(`Failed to create charge: ${error.message}`);
      }
      throw error;
    }
  }

  async verifyWebhookSignature(
    body: string,
    signature: string,
  ): Promise<boolean> {
    const { createHmac } = await import("node:crypto");
    const hmac = createHmac(
      "sha256",
      this.configService.get<string>("LLAMA_PAY_WEBHOOK_KEY"),
    );
    hmac.update(body);
    const computedSignature = hmac.digest("hex");
    return computedSignature === signature;
  }

  async handleJobPromotion(
    shortUUID: string,
    jobsService: JobsService,
  ): Promise<void> {
    const job = await jobsService.getJobDetailsByUuid(shortUUID, undefined);
    if (job) {
      const isAlreadyPromoted = job.featured;
      if (isAlreadyPromoted) {
        this.logger.log(
          `Job ${job.shortUUID} is already promoted, extending feature duration...`,
        );
        await jobsService.makeJobFeatured({
          shortUUID: job.shortUUID,
          startDate: new Date(job.featureStartDate).toISOString(),
          endDate: addDays(job.featureEndDate, 7).toISOString(),
        });
      } else {
        this.logger.log(
          `Promoting job ${job.shortUUID} to featured status for a week...`,
        );
        await jobsService.makeJobFeatured({
          shortUUID: job.shortUUID,
          startDate: new Date().toISOString(),
          endDate: addDays(new Date(), 7).toISOString(),
        });
      }
      this.logger.log(`Job ${job.shortUUID} promoted successfully`);
    } else {
      this.logger.error(
        `Job ${shortUUID} could not be promoted because it does not exist`,
      );
    }
  }

  async handleNewSubscription(
    subscriptionMetadata: SubscriptionMetadata,
    action: Metadata["action"],
    subscriptionsService: SubscriptionsService,
  ): Promise<void> {
    await subscriptionsService.createNewSubscription(
      subscriptionMetadata,
      action,
    );
  }
}
