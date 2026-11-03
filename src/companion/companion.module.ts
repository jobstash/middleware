import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "src/auth/auth.module";
import { StripeModule } from "src/stripe/stripe.module";
import {
  CompanionDeviceController,
  CompanionProfileController,
} from "./companion.controller";
import { DeviceAuthGuard } from "./device-execution.guard";
import { DeviceExecutionService } from "./device-execution.service";
import { INTRO_PATHS_HTTP, introPathsHttp } from "./intro-paths";

@Module({
  imports: [AuthModule, StripeModule],
  controllers: [CompanionProfileController, CompanionDeviceController],
  providers: [
    DeviceExecutionService,
    DeviceAuthGuard,
    {
      provide: INTRO_PATHS_HTTP,
      useFactory: introPathsHttp,
      inject: [ConfigService],
    },
  ],
})
export class CompanionModule {}
