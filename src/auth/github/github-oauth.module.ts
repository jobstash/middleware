import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtAuthModule } from "../jwt/jwt-auth.module";
import { UserService } from "../user/user.service";
import { GithubOauthController } from "./github-oauth.controller";
import { AuthService } from "../auth.service";
import { JwtService } from "@nestjs/jwt";
import { GithubOauthStrategy } from "./github-oauth.strategy";

@Module({
  imports: [JwtAuthModule, ConfigModule],
  controllers: [GithubOauthController],
  providers: [GithubOauthStrategy, UserService, AuthService, JwtService],
})
export class GithubOauthModule {}
