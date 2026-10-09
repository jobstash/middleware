import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { StripeModule } from "src/stripe/stripe.module";
import {
  CompanionDeviceController,
  CompanionProfileController,
} from "./companion.controller";
import { DeviceAuthGuard } from "./device-execution.guard";
import { DeviceExecutionService } from "./device-execution.service";

@Module({
  imports: [AuthModule, StripeModule],
  controllers: [CompanionProfileController, CompanionDeviceController],
  providers: [DeviceExecutionService, DeviceAuthGuard],
})
export class CompanionModule {}
