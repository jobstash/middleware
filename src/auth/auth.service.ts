import { Injectable } from "@nestjs/common";
import { UserEntity } from "src/shared/types";
import { JwtService } from "@nestjs/jwt";
import { UserService } from "./user/user.service";
import { EncryptionService } from "./encryption/encryption.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  createToken(user: UserEntity): string {
    const token = this.jwtService.sign(user.getClaims(), {
      secret: this.configService.get<string>("JWT_SECRET"),
    });

    return token;
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserEntity | undefined> {
    const user = await this.userService.find(email);

    if (
      user &&
      (await this.encryptionService.compare(password, user.getPassword()))
    ) {
      return user;
    }

    return undefined;
  }
}
