import { forwardRef, Module } from "@nestjs/common";
import { AccountService } from "./account.service";
import { AccountController } from "./account.controller";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { AuthModule } from "../auth.module";
import { MailModule } from "src/mail/mail.module";
import { UserModule } from "src/user/user.module";
import { ProfileModule } from "../profile/profile.module";

@Module({
  imports: [
    MailModule,
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
  ],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
