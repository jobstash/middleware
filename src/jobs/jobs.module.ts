import { Module, forwardRef } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/user/user.module";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "src/auth/auth.service";
import { TagsService } from "src/tags/tags.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ScorerService } from "src/scorer/scorer.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";
import { ProfileModule } from "src/auth/profile/profile.module";
import { CoinbaseCommerceModule } from "src/coinbase-commerce/coinbase-commerce.module";
import { CoinbaseCommerceService } from "src/coinbase-commerce/coinbase-commerce.service";

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
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
    CoinbaseCommerceModule,
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    TagsService,
    AuthService,
    JwtService,
    ModelService,
    OrganizationsService,
    ScorerService,
  ],
})
export class JobsModule {}
