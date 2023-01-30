import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthResolver } from "./auth.resolver";
import { GithubOauthModule } from "./github/github-oauth.module";
import { JwtAuthModule } from "./jwt/jwt-auth.module";

@Module({
  imports: [GithubOauthModule, JwtAuthModule],
  providers: [AuthResolver, AuthService],
})
export class AuthModule {}
