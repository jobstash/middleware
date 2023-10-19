import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "../user/user.service";
import { MagicAuthStrategy } from "./magic-auth.strategy";
import { UserFlowService } from "../user/user-flow.service";
import { UserRoleService } from "../user/user-role.service";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { AuthModule } from "../auth.module";

@Module({
  imports: [forwardRef(() => AuthModule), ConfigModule, MailModule],
  providers: [
    MagicAuthStrategy,
    UserService,
    UserFlowService,
    UserRoleService,
    MailService,
  ],
  exports: [MagicAuthStrategy],
})
export class MagicAuthModule {}
