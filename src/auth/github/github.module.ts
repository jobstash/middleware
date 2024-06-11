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
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          Authorization: `Bearer ${configService.get<string>(
            "SCORER_API_KEY",
          )}`,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: REALLY_LONG_TIME,
        baseURL: configService.get<string>("SCORER_DOMAIN"),
      }),
    }),
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
