import { Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { BackendService } from "src/backend/backend.service";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, BackendService, AuthService, JwtService],
})
export class OrganizationsModule {}
