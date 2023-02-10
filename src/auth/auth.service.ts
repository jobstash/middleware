import { Injectable } from "@nestjs/common";
import { UserEntity } from "src/shared/types";
import { JwtService } from "@nestjs/jwt";
import { UserService } from "./user/user.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  createToken(user: UserEntity): string {
    const token = this.jwtService.sign(user.getId(), {
      secret: this.configService.get<string>("JWT_SECRET"),
    });

    return token;
  }

  async validateUser(id: number): Promise<UserEntity | undefined> {
    const user = await this.userService.find(id);

    if (user) {
      return user;
    }

    return undefined;
  }
}
