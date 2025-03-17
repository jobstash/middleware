import { forwardRef, Module } from "@nestjs/common";
import { PrivyService } from "./privy.service";
import { PrivyController } from "./privy.controller";
import { AuthModule } from "../auth.module";
import { UserModule } from "src/user/user.module";
import { TelemetryModule } from "src/telemetry/telemetry.module";
import { ProfileModule } from "../profile/profile.module";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
    TelemetryModule,
  ],
  controllers: [PrivyController],
  providers: [PrivyService],
  exports: [PrivyService],
})
export class PrivyModule {}
