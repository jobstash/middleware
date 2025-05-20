import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserService } from "./user.service";
import { GithubModule } from "../auth/github/github.module";
import { ModelService } from "src/model/model.service";
import { JwtService } from "@nestjs/jwt";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { AuthService } from "src/auth/auth.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { JobsService } from "src/jobs/jobs.service";
import { ScorerService } from "src/scorer/scorer.service";
import { RpcService } from "src/user/rpc.service";
import { PrivyModule } from "src/auth/privy/privy.module";
import { PrivyService } from "src/auth/privy/privy.service";
import { GithubUserService } from "src/auth/github/github-user.service";
import { ProfileModule } from "src/auth/profile/profile.module";
import { HttpModule } from "@nestjs/axios";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";
import { PermissionService } from "./permission.service";
import { UserController } from "./user.controller";
import { Auth0Module } from "src/auth0/auth0.module";
import { TagsService } from "src/tags/tags.service";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { BullModule } from "@nestjs/bull";
import { StripeModule } from "src/stripe/stripe.module";

@Module({
  imports: [
    Auth0Module,
    StripeModule,
    forwardRef(() => GithubModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => ProfileModule),
    forwardRef(() => SubscriptionsModule),
    BullModule.registerQueue({
      name: "mail",
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
        },
        removeOnComplete: true,
        timeout: 60000,
      },
    }),
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
    ConfigModule,
    MailModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    ModelService,
    JwtService,
    MailService,
    AuthService,
    OrganizationsService,
    JobsService,
    ScorerService,
    RpcService,
    PrivyService,
    GithubUserService,
    PermissionService,
    TagsService,
  ],
  exports: [UserService, ModelService, RpcService, PermissionService],
})
export class UserModule {}
