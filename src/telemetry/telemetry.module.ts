import {
  VisitorActivityController,
  VisitorIngestGuard,
} from "src/visitor-activity/visitor-activity.controller";
import { VisitorActivityService } from "src/visitor-activity/visitor-activity.service";
import { forwardRef, Module } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";
import { TelemetryController } from "./telemetry.controller";
import { AuthModule } from "src/auth/auth.module";
import { UserModule } from "src/user/user.module";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => UserModule)],
  controllers: [TelemetryController, VisitorActivityController],
  providers: [TelemetryService, VisitorActivityService, VisitorIngestGuard],
  exports: [TelemetryService],
})
export class TelemetryModule {}
