import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "src/auth/auth.module";
import { AuthService } from "src/auth/auth.service";
import { GithubUserService } from "src/auth/github/github-user.service";
import { UserModule } from "src/auth/user/user.module";
import { UserService } from "src/auth/user/user.service";
import { BackendService } from "./backend.service";

@Module({
  imports: [
    AuthModule,
    UserModule,
    CacheModule.register(),
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
  ],
  providers: [
    AuthService,
    ConfigService,
    UserService,
    GithubUserService,
    BackendService,
  ],
  exports: [
    AuthService,
    ConfigService,
    UserService,
    GithubUserService,
    BackendService,
  ],
})
export class BackendModule {}
