import { Module, forwardRef } from "@nestjs/common";
import { GithubController } from "./github.controller";
import { AuthModule } from "../auth.module";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { UserModule } from "../user/user.module";
import { UserService } from "../user/user.service";
import { GithubUserService } from "./github-user.service";

@Module({
  imports: [
    forwardRef(() => UserModule),
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
  providers: [UserService, GithubUserService],
})
export class GithubModule {}
