import { forwardRef, Module } from "@nestjs/common";
import { ProfileV2Controller } from "./profile-v2.controller";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { RpcService } from "../../../user/rpc.service";
import { JobsService } from "src/jobs/jobs.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";
import { AuthModule } from "../../auth.module";
import { PrivyModule } from "../../privy/privy.module";
import { UserModule } from "src/user/user.module";
import { ProfileModule } from "../profile.module";
import { TagsService } from "src/tags/tags.service";
import { ScorerService } from "src/scorer/scorer.service";
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => ProfileModule),
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
  ],
  controllers: [ProfileV2Controller],
  providers: [
    JwtService,
    ModelService,
    MailService,
    RpcService,
    ScorerService,
    JobsService,
    TagsService,
  ],
})
export class ProfileV2Module {}
