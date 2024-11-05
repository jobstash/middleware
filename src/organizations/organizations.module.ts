import { Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { ModelService } from "src/model/model.service";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";

@Module({
  imports: [AuthModule, Auth0Module],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, ModelService],
})
export class OrganizationsModule {}
