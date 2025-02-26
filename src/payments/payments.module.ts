import { forwardRef, Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JobsService } from "src/jobs/jobs.service";
import { ModelService } from "src/model/model.service";
import { RpcService } from "src/user/rpc.service";
import { ScorerService } from "src/scorer/scorer.service";
import { PrivyModule } from "src/auth/privy/privy.module";
import { UserModule } from "src/user/user.module";
import { ProfileModule } from "src/auth/profile/profile.module";
import { TagsService } from "src/tags/tags.service";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => ProfileModule),
    forwardRef(() => SubscriptionsModule),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          "Content-Type": "application/json",
          "X-CC-Api-Key": configService.get<string>("LLAMA_PAY_API_KEY"),
        },
        baseURL: "https://api.llamapay.io/",
      }),
    }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    JobsService,
    ModelService,
    RpcService,
    TagsService,
    ScorerService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
