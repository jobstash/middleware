import { forwardRef, Module } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";
import { TelemetryController } from "./telemetry.controller";
import { AuthModule } from "src/auth/auth.module";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
