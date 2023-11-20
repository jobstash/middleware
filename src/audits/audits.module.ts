import { Module, forwardRef } from "@nestjs/common";
import { AuditsService } from "./audits.service";
import { AuditsController } from "./audits.controller";
import { UserModule } from "src/user/user.module";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [AuditsController],
  providers: [AuditsService, AuthService, JwtService, ModelService],
})
export class AuditsModule {}
