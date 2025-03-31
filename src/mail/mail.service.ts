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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @InjectQueue("mail") private mailQueue: Queue<any>,
    private readonly configService: ConfigService,
  ) {
    SendGrid.setApiKey(this.configService.get<string>("SENDGRID_API_KEY"));
  }

  async sendEmail(
    mail: SendGrid.MailDataRequired,
  ): Promise<[SendGrid.ClientResponse, object]> {
    const result = await SendGrid.send(mail);
    this.logger.log(`Mail sent to user`);
    return result;
  }

  async scheduleEmail(
    mail: SendGrid.MailDataRequired,
    time: number,
  ): Promise<Job<SendGrid.MailDataRequired>> {
    const now = new Date();
    const delay = differenceInMilliseconds(now, new Date(time));
    return this.mailQueue.add("send", mail, { delay });
  }

  async scheduleEmailWithPredicate<T>(data: {
    mail: SendGrid.MailDataRequired;
    predicateName: string;
    predicateData: T;
    time: number;
  }): Promise<
    Job<{
      mail: SendGrid.MailDataRequired;
      predicateName: string;
      predicateData: object;
    }>
  > {
    const { mail, predicateName, predicateData, time } = data;
    const now = new Date();
    const delay = differenceInMilliseconds(now, new Date(time));
    return this.mailQueue.add(
      "predicated-send",
      { mail, predicateName, predicateData },
      {
        delay,
      },
    );
  }
}
