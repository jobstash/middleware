import { InjectQueue } from "@nestjs/bull";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as SendGrid from "@sendgrid/mail";
import { Job, Queue } from "bull";
import { differenceInMilliseconds } from "date-fns";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class MailService {
  private logger = new CustomLogger(MailService.name);
  constructor(
    @InjectQueue("mail") private mailQueue: Queue<SendGrid.MailDataRequired>,
    private readonly configService: ConfigService,
  ) {
    SendGrid.setApiKey(this.configService.get<string>("SENDGRID_API_KEY"));
  }

  async sendEmail(
    mail: SendGrid.MailDataRequired,
  ): Promise<[SendGrid.ClientResponse, object]> {
    const result = await SendGrid.send(mail);
    this.logger.log(`Mail sent to ${mail.to}`);
    return result;
  }

  async scheduleEmail(
    mail: SendGrid.MailDataRequired,
    time: number,
  ): Promise<Job<SendGrid.MailDataRequired>> {
    const now = new Date();
    const delay = differenceInMilliseconds(now, new Date(time));
    return this.mailQueue.add(mail, { delay });
  }

  // async sendPaymentReminderEmail(
  //   paymentId: string,
  //   mail: SendGrid.MailDataRequired,
  // ) {}
}
