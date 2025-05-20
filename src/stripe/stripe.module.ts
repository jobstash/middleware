import { DynamicModule, forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { StripeController } from "./stripe.controller";
import { StripeService } from "./stripe.service";
import Stripe from "stripe";
import { JobsModule } from "src/jobs/jobs.module";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { AuthModule } from "src/auth/auth.module";
import { ProfileModule } from "src/auth/profile/profile.module";
import { UserModule } from "src/user/user.module";

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
    {
      provide: "STRIPE_CLIENT",
      useFactory: async (configService: ConfigService) =>
        new Stripe(configService.get<string>("STRIPE_API_KEY")),
      inject: [ConfigService],
    },
    {
      provide: "STRIPE_WEBHOOK_SECRET",
      useFactory: async (configService: ConfigService) =>
        configService.get<string>("STRIPE_WEBHOOK_SECRET"),
      inject: [ConfigService],
    },
    {
      provide: "DOMAIN",
      useFactory: async (configService: ConfigService) =>
        configService.get<string>("ORG_ADMIN_DOMAIN"),
      inject: [ConfigService],
    },
  ],
  exports: [StripeService],
})
export class StripeModule {}
