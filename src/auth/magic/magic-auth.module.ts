import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "../../user/user.service";
import { DevMagicAuthStrategy } from "./dev.magic-auth.strategy";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { AuthModule } from "../auth.module";
import { ModelService } from "src/model/model.service";
import { OrgMagicAuthStrategy } from "./org.magic-auth.strategy";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "../profile/profile.service";
import { HttpModule } from "@nestjs/axios";
import { PrivyModule } from "../privy/privy.module";
import { GithubModule } from "../github/github.module";
import { ProfileModule } from "../profile/profile.module";
import { ScorerModule } from "src/scorer/scorer.module";

@Module({
  imports: [
    HttpModule.register({ timeout: 10000 }),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => GithubModule),
    forwardRef(() => ProfileModule),
    forwardRef(() => ScorerModule),
    ConfigModule,
    MailModule,
  ],
  providers: [
    DevMagicAuthStrategy,
    OrgMagicAuthStrategy,
    UserService,
    MailService,
    ModelService,
    ProfileService,
  ],
  exports: [DevMagicAuthStrategy, OrgMagicAuthStrategy],
})
export class MagicAuthModule {}
