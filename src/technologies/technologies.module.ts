import { Module, forwardRef } from "@nestjs/common";
import { TechnologiesService } from "./technologies.service";
import { TechnologiesController } from "./technologies.controller";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { BackendModule } from "src/backend/backend.module";

@Module({
  imports: [forwardRef(() => BackendModule)],
  controllers: [TechnologiesController],
  providers: [TechnologiesService, AuthService, JwtService, ModelService],
})
export class TechnologiesModule {}
