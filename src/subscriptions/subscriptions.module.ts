import { forwardRef, Module } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { MailModule } from "src/mail/mail.module";
import { AuthModule } from "src/auth/auth.module";
import { UserModule } from "src/user/user.module";
import { ProfileModule } from "src/auth/profile/profile.module";
import { StripeModule } from "src/stripe/stripe.module";

@Module({
  imports: [
    MailModule,
    StripeModule.forRootAsync(),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
