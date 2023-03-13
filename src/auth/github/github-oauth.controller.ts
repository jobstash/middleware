import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { AuthUser } from "src/shared/decorators/auth-user.decorator";
import { AuthenticatedUser, User } from "src/shared/types";
import { AuthService } from "../auth.service";
import { GithubOauthGuard } from "./github-oauth.guard";

@Controller("oauth")
@ApiExtraModels(AuthenticatedUser)
export class GithubOauthController {
  constructor(private readonly authService: AuthService) {}

  @Get("github")
  @UseGuards(GithubOauthGuard)
  // eslint-disable-next-line
  github() {}

  @Get("callback")
  @UseGuards(GithubOauthGuard)
  @ApiOkResponse({
    description: "Github oauth response",
    schema: {
      $ref: getSchemaPath(AuthenticatedUser),
      properties: {},
    },
  })
  @ApiInternalServerErrorResponse({
    description: "Something went wrong authenticating the user",
  })
  callback(
    @AuthUser()
    user: User,
  ): AuthenticatedUser {
    const accessToken = this.authService.createToken(user.githubNodeId);
    return {
      githubLogin: user.githubLogin,
      githubId: user.githubId,
      githubNodeId: user.githubNodeId,
      githubGravatarId: user.githubGravatarId,
      githubAvatarUrl: user.githubAvatarUrl,
      accessToken: accessToken,
    };
  }
}
