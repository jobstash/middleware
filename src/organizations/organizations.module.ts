import { Module, forwardRef } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/auth/user/user.module";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, AuthService, JwtService, ModelService],
})
export class OrganizationsModule {}
