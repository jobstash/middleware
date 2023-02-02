import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { GithubOauthModule } from "./github/github-oauth.module";
import { JwtAuthModule } from "./jwt/jwt-auth.module";

@Module({
  imports: [GithubOauthModule, JwtAuthModule],
  providers: [AuthController, AuthService],
})
export class AuthModule {}
