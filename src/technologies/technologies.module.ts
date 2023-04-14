import { Module } from "@nestjs/common";
import { TechnologiesService } from "./technologies.service";
import { TechnologiesController } from "./technologies.controller";
import { BackendService } from "src/backend/backend.service";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";

@Module({
  controllers: [TechnologiesController],
  providers: [TechnologiesService, BackendService, AuthService, JwtService],
})
export class TechnologiesModule {}
