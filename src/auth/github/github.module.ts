import { Module, forwardRef } from "@nestjs/common";
import { GithubController } from "./github.controller";
import { BackendModule } from "src/backend/backend.module";
import { AuthModule } from "../auth.module";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { BackendService } from "src/backend/backend.service";
import { UserModule } from "../user/user.module";
import { UserService } from "../user/user.service";
import { GithubUserService } from "./github-user.service";

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => BackendModule),
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
  controllers: [GithubController],
  providers: [BackendService, UserService, GithubUserService],
})
export class GithubModule {}
