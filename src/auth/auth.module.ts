import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { JwtAuthModule } from "./jwt/jwt-auth.module";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    JwtAuthModule,
    ConfigModule,
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
  providers: [JwtService, ConfigService],
})
export class AuthModule {}
