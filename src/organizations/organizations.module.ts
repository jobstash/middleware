import { Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { ModelService } from "src/model/model.service";

@Module({
  imports: [],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, ModelService],
})
export class OrganizationsModule {}
