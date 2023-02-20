import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GithubOauthModule } from "./github/github-oauth.module";
import { JwtAuthModule } from "./jwt/jwt-auth.module";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthenticationModule } from "@twirelab/nestjs-auth0";

@Module({
  imports: [
    GithubOauthModule,
    JwtAuthModule,
    ConfigModule,
    AuthenticationModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        domain: configService.get<string>("AUTH0_DOMAIN"),
        clientId: configService.get<string>("AUTH0_CLIENT_ID"),
        clientSecret: configService.get<string>("AUTH0_CLIENT_SECRET"),
        telemetry: false,
      }),
    }),
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
