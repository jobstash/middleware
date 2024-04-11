import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "./user.service";
import { UserFlowService } from "./user-flow.service";
import { UserRoleService } from "./user-role.service";
import { GithubModule } from "../auth/github/github.module";
import { UserController } from "./user.controller";
import { ModelService } from "src/model/model.service";
import { JwtService } from "@nestjs/jwt";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { AuthService } from "src/auth/auth.service";
import { GoogleBigQueryService } from "src/auth/github/google-bigquery.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { JobsService } from "src/jobs/jobs.service";

@Module({
  imports: [forwardRef(() => GithubModule), ConfigModule, MailModule],
  controllers: [UserController],
  providers: [
    UserService,
    UserFlowService,
    UserRoleService,
    ModelService,
    JwtService,
    MailService,
    AuthService,
    OrganizationsService,
    GoogleBigQueryService,
    JobsService,
    ProfileService,
  ],
  exports: [
    UserService,
    UserFlowService,
    UserRoleService,
    ModelService,
    GoogleBigQueryService,
    OrganizationsService,
  ],
})
export class UserModule {}
