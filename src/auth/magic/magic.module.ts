import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "../../user/user.service";
import { MagicAuthStrategy } from "./magic.strategy";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { AuthModule } from "../auth.module";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "../profile/profile.service";
import { HttpModule } from "@nestjs/axios";
import { PrivyModule } from "../privy/privy.module";
import { GithubModule } from "../github/github.module";
import { ProfileModule } from "../profile/profile.module";
import { ScorerModule } from "src/scorer/scorer.module";
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    HttpModule.register({ timeout: 10000 }),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => GithubModule),
    forwardRef(() => ProfileModule),
    forwardRef(() => ScorerModule),
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
    ConfigModule,
    MailModule,
  ],
  providers: [
    MagicAuthStrategy,
    UserService,
    MailService,
    ModelService,
    ProfileService,
  ],
  exports: [MagicAuthStrategy],
})
export class MagicAuthModule {}
