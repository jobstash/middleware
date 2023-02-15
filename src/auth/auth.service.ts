import { Injectable } from "@nestjs/common";
import { User } from "src/shared/types";
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

  createToken(user: User): string {
    const token = this.jwtService.sign(user.node_id, {
      secret: this.configService.get<string>("JWT_SECRET"),
    });

    return token;
  }

  async validateUser(id: string): Promise<User | undefined> {
    const user = await this.userService.find(id);

    if (user) {
      return user.getProperties();
    }

    return undefined;
  }
}
