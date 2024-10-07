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
import { PaymentsModule } from "src/payments/payments.module";
import { PrivyModule } from "src/auth/privy/privy.module";

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
    forwardRef(() => PrivyModule),
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
    forwardRef(() => PaymentsModule),
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
  exports: [JobsService],
})
export class JobsModule {}
