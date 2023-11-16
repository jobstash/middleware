import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserService } from "../../user/user.service";
import { User } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";

@Injectable()
export class JwtAuthStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new CustomLogger(JwtAuthStrategy.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme("Bearer"),
      ignoreExpiration:
        configService.get<string>("JWT_IGNORE_EXPIRATION") == "true",
      secretOrKey: configService.get<string>("JWT_SECRET"),
    });
  }
  async validate(payload: string): Promise<User | null> {
    return this.userService
      .findByGithubNodeId(payload)
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
            source: "jwt-auth.strategy",
          });
          scope.setExtra("input", payload);
          Sentry.captureException(err);
        });
        this.logger.error(`JwtAuthStrategy::validate ${err.message}`);
        return null;
      });
  }
}
