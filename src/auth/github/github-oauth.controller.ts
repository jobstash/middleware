import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthUser } from "src/decorators/auth-user.decorator";
import { User } from "src/auth/user/user.entity";
import { GithubOauthGuard } from "./github-oauth.guard";
import { UserProperties } from "src/interfaces/user/user-properties.interface";

@Controller("oauth")
export class GithubOauthController {
  @UseGuards(GithubOauthGuard)
  @Get("github")
  // eslint-disable-next-line
  github() {}

  @UseGuards(GithubOauthGuard)
  @Get("callback")
  callback(@AuthUser() user: User): UserProperties {
    return user.toJson();
  }
}
