import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserService } from "../user/user.service";
import { SiweJwtAuthStrategy } from "./siwe-jwt-auth.strategy";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "siwe-jwt" }),
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
    ConfigModule,
  ],
  providers: [SiweJwtAuthStrategy, UserService],
})
export class SiweJwtAuthModule {}
