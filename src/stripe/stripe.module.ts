import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { StripeController } from "./stripe.controller";
import { StripeService } from "./stripe.service";
import Stripe = require("stripe");
import { JobsModule } from "src/jobs/jobs.module";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { AuthModule } from "src/auth/auth.module";
import { ProfileModule } from "src/auth/profile/profile.module";
import { UserModule } from "src/user/user.module";
import { SubscriptionService as CandidateSubscriptionService } from "src/companion/subscription.service";

@Module({
  controllers: [StripeController],
  imports: [
    ConfigModule.forRoot(),
    SubscriptionsModule,
    forwardRef(() => JobsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
  ],
  providers: [
    StripeService,
    CandidateSubscriptionService,
    {
      provide: "STRIPE_CLIENT",
      useFactory: (configService: ConfigService): Stripe =>
        new Stripe(configService.get<string>("STRIPE_API_KEY")),
      inject: [ConfigService],
    },
    {
      provide: "STRIPE_WEBHOOK_SECRET",
      useFactory: (configService: ConfigService): string | undefined =>
        configService.get<string>("STRIPE_WEBHOOK_SECRET"),
      inject: [ConfigService],
    },
    {
      provide: "DOMAIN",
      useFactory: (configService: ConfigService): string | undefined =>
        configService.get<string>("ORG_ADMIN_DOMAIN"),
      inject: [ConfigService],
    },
  ],
  exports: [StripeService, CandidateSubscriptionService],
})
export class StripeModule {}
