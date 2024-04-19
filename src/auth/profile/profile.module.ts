import { Module, forwardRef } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { ProfileController } from "./profile.controller";
import { UserModule } from "../../user/user.module";
import { AuthService } from "../auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { MailModule } from "src/mail/mail.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MailService } from "src/mail/mail.service";
import { ThrottlerModule } from "@nestjs/throttler";
import { UserService } from "src/user/user.service";
import { SiweService } from "../siwe/siwe.service";
import { ScorerService } from "src/scorer/scorer.service";
import { HttpModule } from "@nestjs/axios";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";

@Module({
  imports: [
    forwardRef(() => UserModule),
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
    SiweService,
    ScorerService,
  ],
})
export class ProfileModule {}
