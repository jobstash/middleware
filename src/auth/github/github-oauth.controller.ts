import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthUser } from "src/shared/decorators/auth-user.decorator";
import { AuthenticatedUser, UserEntity } from "src/shared/types";
import { AuthService } from "../auth.service";
import { GithubOauthGuard } from "./github-oauth.guard";

@Controller("oauth")
export class GithubOauthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(GithubOauthGuard)
  @Get("github")
  // eslint-disable-next-line
  github() {}

  @UseGuards(GithubOauthGuard)
  @Get("callback")
  callback(@AuthUser() user: UserEntity): AuthenticatedUser {
    const accessToken = this.authService.createToken(user);
    const properties = user.getProperties();
    return { ...properties, accessToken: accessToken };
  }
}
