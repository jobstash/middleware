import { Module } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { BackendService } from "src/backend/backend.service";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    BackendService,
    AuthService,
    JwtService,
    ModelService,
  ],
})
export class ProjectsModule {}
