import { Module, forwardRef } from "@nestjs/common";
import { SiweController } from "./siwe.controller";
import { AuthModule } from "../auth.module";
import { AuthService } from "../auth.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserService } from "../../user/user.service";
import { GithubUserService } from "../github/github-user.service";
import { UserRoleService } from "../../user/user-role.service";
import { UserFlowService } from "../../user/user-flow.service";
import { CacheModule } from "@nestjs/cache-manager";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/user/user.module";
import { SiweService } from "./siwe.service";
import { ProfileService } from "../profile/profile.service";

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
    forwardRef(() => UserModule),
  ],
  controllers: [SiweController],
  providers: [
    AuthService,
    JwtService,
    UserService,
    UserRoleService,
    UserFlowService,
    ModelService,
    GithubUserService,
    SiweService,
    ProfileService,
  ],
  exports: [SiweService],
})
export class SiweModule {}
