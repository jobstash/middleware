import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
import { OrganizationsService } from "src/organizations/organizations.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { JobsService } from "src/jobs/jobs.service";
import { ScorerService } from "src/scorer/scorer.service";
import { HttpModule } from "@nestjs/axios";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";

@Module({
  imports: [
    forwardRef(() => GithubModule),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          Authorization: `Bearer ${configService.get<string>(
            "SCORER_API_KEY",
          )}`,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: REALLY_LONG_TIME,
        baseURL: configService.get<string>("SCORER_DOMAIN"),
      }),
    }),
    ConfigModule,
    MailModule,
  ],
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
    JobsService,
    ProfileService,
    ScorerService,
  ],
  exports: [
    UserService,
    UserFlowService,
    UserRoleService,
    ModelService,
    OrganizationsService,
  ],
})
export class UserModule {}
