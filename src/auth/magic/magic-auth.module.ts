import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "../../user/user.service";
import { DevMagicAuthStrategy } from "./dev.magic-auth.strategy";
import { UserFlowService } from "../../user/user-flow.service";
import { UserRoleService } from "../../user/user-role.service";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { AuthModule } from "../auth.module";
import { ModelService } from "src/model/model.service";
import { OrgMagicAuthStrategy } from "./org.magic-auth.strategy";

@Module({
  imports: [forwardRef(() => AuthModule), ConfigModule, MailModule],
  providers: [
    DevMagicAuthStrategy,
    OrgMagicAuthStrategy,
    UserService,
    UserFlowService,
    UserRoleService,
    MailService,
    ModelService,
  ],
  exports: [DevMagicAuthStrategy, OrgMagicAuthStrategy],
})
export class MagicAuthModule {}
