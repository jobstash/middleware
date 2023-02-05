import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { GithubOauthModule } from "./github/github-oauth.module";
import { JwtAuthModule } from "./jwt/jwt-auth.module";
import { UserService } from "./user/user.service";
import { EncryptionService } from "./encryption/encryption.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    GithubOauthModule,
    JwtAuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN"),
        },
      }),
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, UserService, EncryptionService, JwtService],
})
export class AuthModule {}
