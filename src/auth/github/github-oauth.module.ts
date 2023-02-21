import { CacheModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtAuthModule } from "../jwt/jwt-auth.module";
import { UserService } from "../user/user.service";
import { GithubOauthController } from "./github-oauth.controller";
import { AuthService } from "../auth.service";
import { JwtService } from "@nestjs/jwt";
import { GithubOauthStrategy } from "./github-oauth.strategy";
import { BackendService } from "src/backend/backend.service";

@Module({
  imports: [JwtAuthModule, ConfigModule, CacheModule.register()],
  controllers: [GithubOauthController],
  providers: [
    GithubOauthStrategy,
    UserService,
    AuthService,
    JwtService,
    BackendService,
  ],
})
export class GithubOauthModule {}
