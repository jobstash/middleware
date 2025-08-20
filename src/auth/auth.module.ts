import { Module, forwardRef } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { UserModule } from "../user/user.module";
import { MailModule } from "src/mail/mail.module";
import { MagicAuthModule } from "./magic/magic.module";
import { ProfileModule } from "./profile/profile.module";
import { ModelService } from "src/model/model.service";
import { AccountModule } from "./account/account.module";

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => ProfileModule),
    ConfigModule,
    MailModule,
    MagicAuthModule,
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
    AccountModule,
  ],
  controllers: [AuthController],
  providers: [JwtService, ConfigService, AuthService, ModelService],
  exports: [AuthService],
})
export class AuthModule {}
