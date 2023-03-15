import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserService } from "../user/user.service";
import { User } from "src/shared/types";

@Injectable()
export class SiweJwtAuthStrategy extends PassportStrategy(
  Strategy,
  "siwe-jwt",
) {
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
    return this.userService.findByWallet(payload).then(user => {
      if (user !== undefined) {
        return user.getProperties();
      } else {
        return null;
      }
    });
  }
}