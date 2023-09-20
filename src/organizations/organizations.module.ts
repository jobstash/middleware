import { Module, forwardRef } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { BackendModule } from "src/backend/backend.module";
import { UserModule } from "src/auth/user/user.module";

@Module({
  imports: [forwardRef(() => BackendModule), forwardRef(() => UserModule)],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, AuthService, JwtService, ModelService],
})
export class OrganizationsModule {}
