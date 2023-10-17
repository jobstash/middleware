import { Module, forwardRef } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/auth/user/user.module";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "src/auth/auth.service";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [JobsController],
  providers: [JobsService, AuthService, JwtService, ModelService],
})
export class JobsModule {}
