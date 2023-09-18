import { Module, forwardRef } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { ModelService } from "src/model/model.service";
import { BackendModule } from "src/backend/backend.module";

@Module({
  imports: [forwardRef(() => BackendModule)],
  controllers: [ProjectsController],
  providers: [ProjectsService, ModelService],
})
export class ProjectsModule {}
