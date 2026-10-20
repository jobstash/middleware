import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "src/auth/auth.module";
import { StripeModule } from "src/stripe/stripe.module";
import {
  CompanionDeviceController,
  CompanionProfileController,
} from "./companion.controller";
import { CvShareService } from "./cv-share.service";
import { CV_OBJECT_STORAGE, r2CvObjectStorage } from "./cv-storage";
import { DeviceAuthGuard } from "./device-execution.guard";
import { DeviceExecutionService } from "./device-execution.service";

@Module({
  imports: [AuthModule, StripeModule],
  controllers: [CompanionProfileController, CompanionDeviceController],
  providers: [
    DeviceExecutionService,
    DeviceAuthGuard,
    CvShareService,
    {
      provide: CV_OBJECT_STORAGE,
      useFactory: r2CvObjectStorage,
      inject: [ConfigService],
    },
  ],
})
export class CompanionModule {}
