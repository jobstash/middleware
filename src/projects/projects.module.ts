import { Module } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { ModelService } from "src/model/model.service";
import { ProjectCategoryService } from "./project-category.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";

@Module({
  imports: [AuthModule, Auth0Module],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectCategoryService,
    OrganizationsService,
    ModelService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
