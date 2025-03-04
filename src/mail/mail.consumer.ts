import { Process, Processor } from "@nestjs/bull";
import * as SendGrid from "@sendgrid/mail";
import * as Sentry from "@sentry/node";
import { Job } from "bull";
import { MailService } from "./mail.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PredicateService } from "./predicate.service";

@Processor("mail")
export class MailConsumer {
  private logger = new CustomLogger(MailConsumer.name);
  constructor(
    private readonly mailService: MailService,
    private readonly predicateService: PredicateService,
  ) {}

  @Process("send")
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

  @Process("predicated-send")
  async sendEmailWithPredicate(
    job: Job<{
      mail: SendGrid.MailDataRequired;
      predicateName: string;
      predicateData: object;
    }>,
  ): Promise<[SendGrid.ClientResponse, object]> {
    try {
      const shouldSend = await this.predicateService
        .getPredicates()
        [job.data.predicateName](job.data.predicateData);
      if (shouldSend) {
        return this.mailService.sendEmail(job.data.mail);
      } else {
        this.logger.log(
          `Predicate ${job.data.predicateName} returned false, not sending email`,
        );
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "send-email",
          source: "mail.consumer",
        });
        scope.setExtra("jobData", job.data);
        Sentry.captureException(err);
      });
      this.logger.error(`Failed to send predicated email: ${err.message}`);
    }
  }
}
