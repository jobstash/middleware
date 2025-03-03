import { forwardRef, Module } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { ProfileController } from "./profile.controller";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { RpcService } from "../../user/rpc.service";
import { ScorerService } from "src/scorer/scorer.service";
import { JobsService } from "src/jobs/jobs.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";
import { AuthModule } from "../auth.module";
import { PrivyModule } from "../privy/privy.module";
import { GithubModule } from "../github/github.module";
import { UserModule } from "src/user/user.module";
import { PaymentsModule } from "src/payments/payments.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { TagsService } from "src/tags/tags.service";
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    Auth0Module,
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => GithubModule),
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
    MailModule,
    ConfigModule,
    ThrottlerModule.forRoot(),
    PaymentsModule,
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    JwtService,
    ModelService,
    MailService,
    OrganizationsService,
    RpcService,
    ScorerService,
    JobsService,
    TagsService,
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
