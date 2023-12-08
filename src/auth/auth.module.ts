import { Module, forwardRef } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { JwtAuthModule } from "./jwt/jwt-auth.module";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { UserModule } from "../user/user.module";
import { MailModule } from "src/mail/mail.module";
import { MagicAuthModule } from "./magic/magic-auth.module";
import { ProfileModule } from "./profile/profile.module";
import { ProfileService } from "./profile/profile.service";
import { ModelService } from "src/model/model.service";

@Module({
  imports: [
    forwardRef(() => UserModule),
    JwtAuthModule,
    ConfigModule,
    MailModule,
    MagicAuthModule,
    ProfileModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN"),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtService,
    ConfigService,
    AuthService,
    ProfileService,
    ModelService,
  ],
})
export class AuthModule {}
