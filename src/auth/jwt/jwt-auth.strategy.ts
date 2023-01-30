import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserService } from "../user/user.service";

@Injectable()
export class JwtAuthStrategy extends PassportStrategy(Strategy) {
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
  async validate(payload: object & { email: string }) {
    return this.userService.find(payload.email);
  }
}
