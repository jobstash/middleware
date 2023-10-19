import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as SendGrid from "@sendgrid/mail";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class MailService {
  private logger = new CustomLogger(MailService.name);
  constructor(private readonly configService: ConfigService) {
    SendGrid.setApiKey(this.configService.get<string>("SENDGRID_API_KEY"));
  }

  async sendEmail(
    mail: SendGrid.MailDataRequired,
  ): Promise<[SendGrid.ClientResponse, object]> {
    const transport = await SendGrid.send(mail);
    // this.logger.log(`E-Mail sent to ${mail.to}`);
    return transport;
  }
}
