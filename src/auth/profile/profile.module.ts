import { Module, forwardRef } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { ProfileController } from "./profile.controller";
import { UserModule } from "../../user/user.module";
import { AuthService } from "../auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { MailModule } from "src/mail/mail.module";
import { ConfigModule } from "@nestjs/config";
import { MailService } from "src/mail/mail.service";
import { ThrottlerModule } from "@nestjs/throttler";
import { UserService } from "src/user/user.service";
import { GoogleBigQueryService } from "../github/google-bigquery.service";

@Module({
  imports: [
    forwardRef(() => UserModule),
    MailModule,
    ConfigModule,
    ThrottlerModule.forRoot(),
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    AuthService,
    JwtService,
    ModelService,
    MailService,
    UserService,
    OrganizationsService,
    GoogleBigQueryService,
  ],
})
export class ProfileModule {}
