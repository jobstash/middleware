import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtAuthModule } from "../jwt/jwt-auth.module";
import { EncryptionService } from "../user/encryption/encryption.service";
import { UserService } from "../user/user.service";
import { GithubOauthController } from "./github-oauth.controller";
import { GithubOauthStrategy } from "./github-oauth.strategy";

@Module({
  imports: [JwtAuthModule, ConfigModule],
  controllers: [GithubOauthController],
  providers: [GithubOauthStrategy, UserService, EncryptionService],
})
export class GithubOauthModule {}
