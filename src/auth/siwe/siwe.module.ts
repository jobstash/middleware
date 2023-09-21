import { Module } from "@nestjs/common";
import { SiweController } from "./siwe.controller";
import { AuthModule } from "../auth.module";
import { AuthService } from "../auth.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserService } from "../user/user.service";
import { GithubUserService } from "../github/github-user.service";
import { UserRoleService } from "../user/user-role.service";
import { UserFlowService } from "../user/user-flow.service";
import { CacheModule } from "@nestjs/cache-manager";

@Module({
  imports: [
    AuthModule,
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
    CacheModule.register(),
  ],
  controllers: [SiweController],
  providers: [
    AuthService,
    JwtService,
    UserService,
    UserRoleService,
    UserFlowService,
    GithubUserService,
  ],
})
export class SiweModule {}
