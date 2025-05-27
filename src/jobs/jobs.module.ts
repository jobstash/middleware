import { Module, forwardRef } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { UserModule } from "src/user/user.module";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "src/auth/auth.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ScorerService } from "src/scorer/scorer.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";
import { ProfileModule } from "src/auth/profile/profile.module";
import { PrivyModule } from "src/auth/privy/privy.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { TagsModule } from "src/tags/tags.module";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { StripeModule } from "src/stripe/stripe.module";

@Module({
  imports: [
    Auth0Module,
    forwardRef(() => StripeModule),
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
    forwardRef(() => SubscriptionsModule),
    TagsModule,
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    AuthService,
    JwtService,
    OrganizationsService,
    ScorerService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
