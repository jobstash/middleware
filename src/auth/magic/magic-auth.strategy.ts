import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import Strategy from "passport-magic-login";
import { UserService } from "../user/user.service";
import { User } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import * as SendGrid from "@sendgrid/mail";
import { MailService } from "src/mail/mail.service";

@Injectable()
export class MagicAuthStrategy extends PassportStrategy(Strategy, "magic") {
  private readonly logger = new CustomLogger(MagicAuthStrategy.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
  ) {
    super({
      secret: configService.get<string>("MAGIC_LINK_SECRET"),
      jwtOptions: {
        expiresIn: configService.get<string>("MAGIC_LINK_EXPIRES_IN"),
      },
      callbackUrl: "/auth/magic/login/callback",
      sendMagicLink: async (destination: string, href: string) =>
        this.sendToken(destination, href),
      // eslint-disable-next-line @typescript-eslint/ban-types
      verify: async (payload: { destination: string }, callback: Function) =>
        callback(null, this.verifyUser(payload.destination)),
    });
  }

  async sendToken(
    destination: string,
    href: string,
  ): Promise<[SendGrid.ClientResponse, object]> {
    const link = `${this.configService.get<string>("MW_DOMAIN")}${href}`;
    const msg = {
      to: destination,
      from: this.configService.get<string>("EMAIL"),
      subject: "Sign in to JobStash.xyz",
      text:
        "Hello! Click the link below to finish signing in to JobStash.xyz.\r\n\r\n" +
        link,
      html:
        '<h3>Hello!</h3><p>Click the link below to finish signing in to JobStash.xyz.</p><p><a href="' +
        link +
        '">Sign in</a></p>',
    };
    return this.mailService.sendEmail(msg);
  }

  async verifyUser(payload: string): Promise<User | null> {
    return this.userService
      .verifyUserEmail(payload)
      .then(user => {
        if (user !== undefined) {
          return user.getProperties();
        } else {
          return null;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "token-validate",
            source: "magic-auth.strategy",
          });
          scope.setExtra("input", payload);
          Sentry.captureException(err);
        });
        this.logger.error(`MagicAuthStrategy::verifyUser ${err.message}`);
        return null;
      });
  }
}
