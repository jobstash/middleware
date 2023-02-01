import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { AuthUser } from "src/decorators/auth-user.decorator";
import { User } from "src/auth/user/user.entity";
import { GithubOauthGuard } from "./github-oauth.guard";

@Controller("oauth")
export class GithubOauthController {
  @UseGuards(GithubOauthGuard)
  @Get("github")
  github() {}

  @UseGuards(GithubOauthGuard)
  @Get("callback")
  callback(@AuthUser() user: User) {
    return user.toJson();
  }
}
