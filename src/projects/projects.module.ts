import { Module } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { ModelService } from "src/model/model.service";
import { ProjectCategoryService } from "./project-category.service";
import { OrganizationsService } from "src/organizations/organizations.service";

@Module({
  imports: [],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectCategoryService,
    OrganizationsService,
    ModelService,
  ],
})
export class ProjectsModule {}
