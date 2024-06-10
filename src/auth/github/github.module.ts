import { Module, forwardRef } from "@nestjs/common";
import { GithubController } from "./github.controller";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { UserModule } from "../../user/user.module";
import { UserService } from "../../user/user.service";
import { GithubUserService } from "./github-user.service";
import { ModelService } from "src/model/model.service";
import { ProfileService } from "../profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [
    HttpModule,
    forwardRef(() => UserModule),
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
  providers: [
    UserService,
    GithubUserService,
    ModelService,
    ProfileService,
    ScorerService,
  ],
})
export class GithubModule {}
