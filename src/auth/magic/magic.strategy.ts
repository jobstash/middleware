import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import Strategy from "passport-magic-login";
import { UserService } from "../../user/user.service";
import { User } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import * as SendGrid from "@sendgrid/mail";
import { MailService } from "src/mail/mail.service";
import { button, emailBuilder, text } from "src/shared/helpers";

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
      callbackUrl: "/callback/magic-login",
      sendMagicLink: async (destination: string, href: string) =>
        this.sendToken(destination, href),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      verify: async (payload: { destination: string }, callback: Function) => {
        const user = await this.verifyUser(payload.destination);
        if (user === null) {
          callback({ success: false, message: "Sign up with email failed" });
        } else {
          callback(null, user);
        }
      },
    });
  }

  async sendToken(
    destination: string,
    href: string,
  ): Promise<[SendGrid.ClientResponse, object]> {
    const link = `${this.configService.get<string>("FE_DOMAIN")}${href}`;
    const msg = emailBuilder({
      from: this.configService.get<string>("EMAIL"),
      to: destination,
      subject: "Verify Your Email – Let’s Get You Started on JobStash!",
      title: "Hey there,",
      bodySections: [
        text(
          "Thanks for signing up with JobStash! We just need to make sure it’s really you. Please verify your email address to complete your registration and start accessing all the great features we have for you. 🚀",
        ),
        text("Click the button below to verify your email:"),
        button("Sign in", link),
        text(
          "Please note: This verification link will expire in 24 hours. If you don’t verify your email in time, you can request a new link by visiting JobStash.xyz.",
        ),
        text("If you didn’t request this email, please ignore it."),
      ],
    });
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
            source: "dev.magic-auth.strategy",
          });
          scope.setExtra("input", payload);
          Sentry.captureException(err);
        });
        this.logger.error(`MagicAuthStrategy::verifyUser ${err.message}`);
        return null;
      });
  }
}
