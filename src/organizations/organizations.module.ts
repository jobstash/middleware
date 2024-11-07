import { forwardRef, Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { ModelService } from "src/model/model.service";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { UserModule } from "src/user/user.module";

@Module({
  imports: [AuthModule, Auth0Module, forwardRef(() => UserModule)],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, ModelService],
})
export class OrganizationsModule {}
