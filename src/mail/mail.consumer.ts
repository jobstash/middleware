import { Process, Processor } from "@nestjs/bull";
import * as SendGrid from "@sendgrid/mail";
import * as Sentry from "@sentry/node";
import { Job } from "bull";
import { MailService } from "./mail.service";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Processor("mail")
export class MailConsumer {
  private logger = new CustomLogger(MailConsumer.name);
  constructor(private readonly mailService: MailService) {}

  @Process()
  async sendEmail(
    job: Job<SendGrid.MailDataRequired>,
  ): Promise<[SendGrid.ClientResponse, object]> {
    try {
      return this.mailService.sendEmail(job.data);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "send-email",
          source: "mail.consumer",
        });
        scope.setExtra("jobData", job.data);
        Sentry.captureException(err);
      });
      this.logger.error(`Failed to send email: ${err.message}`);
    }
  }
}
