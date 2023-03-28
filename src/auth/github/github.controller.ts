import { GithubLoginInput } from "./dto/github-login.input";
import { Controller, Get, Post, Body, Redirect } from "@nestjs/common";
import { BackendService } from "../../backend/backend.service";
import { AuthService } from "../auth.service";
import { ConfigService } from "@nestjs/config";
import { CheckWalletRoles, GithubConfig, User } from "src/shared/types";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { UserService } from "../user/user.service";

import axios from "axios";

@Controller("github")
@ApiExtraModels(User)
export class GithubController {
  private readonly ghConfig: GithubConfig;
  constructor(
    private readonly backendService: BackendService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.ghConfig = {
      dev: {
        clientID: this.configService.get<string>("GITHUB_DEV_OAUTH_CLIENT_ID"),
        clientSecret: this.configService.get<string>(
          "GITHUB_DEV_OAUTH_CLIENT_SECRET",
        ),
        scope: ["read:user", "read:org"],
      },
      org: {
        clientID: this.configService.get<string>("GITHUB_ORG_OAUTH_CLIENT_ID"),
        clientSecret: this.configService.get<string>(
          "GITHUB_ORG_OAUTH_CLIENT_SECRET",
        ),
        scope: ["read:user", "read:org"],
      },
    };
  }

  @Get("trigger-dev-github-oauth")
  @Redirect("https://github.com/login/oauth/authorize", 301)
  triggerGithubDevOauth(): { url: string } {
    return {
      url: `https://github.com/login/oauth/authorize?scope=${this.ghConfig.dev.scope.join(
        ",",
      )}&client_id=${this.ghConfig.dev.clientID}`,
    };
  }

  @Get("trigger-org-github-oauth")
  @Redirect("https://github.com/login/oauth/authorize", 301)
  triggerOrgGithubOauth(): { url: string } {
    return {
      url: `https://github.com/login/oauth/authorize?scope=${this.ghConfig.org.scope.join(
        ",",
      )}&client_id=${this.ghConfig.org.clientID}`,
    };
  }

  @Post("github-login")
  @ApiOkResponse({
    description: "User has been authenticated successfully!",
    schema: { $ref: getSchemaPath(User) },
  })
  async githubLogin(@Body() body: GithubLoginInput): Promise<User | undefined> {
    const { wallet, code, role } = body;
    const userByWallet = await this.userService.findByWallet(wallet);

    if (!userByWallet) {
      return null;
    }

    const result = userByWallet.getProperties();
    // Todo: is this ok? How would we update the user github token/data?
    // Todo: handle the case where the user has already logged in but now some data is different
    if (result.githubId === undefined) {
      const { data: tokenParamsString } = await axios.get(
        `https://github.com/login/oauth/access_token?client_id=${
          role === CheckWalletRoles.ORG
            ? this.ghConfig.org.clientID
            : this.ghConfig.dev.clientID
        }&client_secret=${
          role === CheckWalletRoles.ORG
            ? this.ghConfig.org.clientSecret
            : this.ghConfig.dev.clientSecret
        }&code=${code}`,
      );
      // Note: tokenParamsString returns just a string like
      // access_token=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&scope=read%3Aorg%2Cread%3Auser&token_type=bearer
      const params = new URLSearchParams(tokenParamsString);
      const accessToken = params.get("access_token");
      const { data: profileData } = await axios.get(
        "https://api.github.com/user",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return this.backendService.addGithubInfoToUser({
        githubAccessToken: accessToken,
        githubRefreshToken: "", // TODO: where do we get this? tokenData does not return this
        githubLogin: profileData.login,
        githubId: profileData.id,
        githubNodeId: profileData.node_id,
        githubGravatarId:
          profileData.gravatar_id === "" ? undefined : profileData.gravatar_id,
        githubAvatarUrl: profileData.avatar_url,
        wallet: wallet,
        role: role,
      });
    } else {
      //TODO: Why does this feel like it leaks/doxxes users?
      return result;
    }
  }
}
