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
import { UserModule } from "src/user/user.module";
import { ProfileService } from "../profile/profile.service";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    ConfigModule,
    MailModule,
  ],
  providers: [
    DevMagicAuthStrategy,
    OrgMagicAuthStrategy,
    UserService,
    UserFlowService,
    UserRoleService,
    MailService,
    ModelService,
    ProfileService,
  ],
  exports: [DevMagicAuthStrategy, OrgMagicAuthStrategy],
})
export class MagicAuthModule {}
