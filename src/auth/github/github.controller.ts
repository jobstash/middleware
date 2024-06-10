import { GithubLoginInput } from "./dto/github-login.input";
import { GithubAuthenticatedUserResponse } from "./dto/github-authenticated-user.response";
import { Controller, Get, Post, Body, Redirect } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GithubConfig, ResponseWithNoData, User } from "src/shared/types";
import {
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { UserService } from "../../user/user.service";

import axios from "axios";
import { responseSchemaWrapper } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GithubUserService } from "./github-user.service";
import { CheckWalletRoles, CheckWalletFlows } from "src/shared/constants";
import { addMonths, isBefore } from "date-fns";
import { ProfileService } from "../profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";

@Controller("github")
@ApiExtraModels(User)
export class GithubController {
  private readonly logger = new CustomLogger(GithubController.name);
  private readonly ghConfig: GithubConfig;
  constructor(
    private readonly githubUserService: GithubUserService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
  ) {
    this.ghConfig = {
      dev: {
        clientID: this.configService.get<string>("GITHUB_DEV_OAUTH_CLIENT_ID"),
        clientSecret: this.configService.get<string>(
          "GITHUB_DEV_OAUTH_CLIENT_SECRET",
        ),
        scope: ["read:user", "read:org"],
      },
    };
  }

  @Get("trigger-dev-github-oauth")
  @Redirect("https://github.com/login/oauth/authorize", 301)
  triggerGithubDevOauth(): { url: string } {
    this.logger.log("/github/trigger-dev-github-oauth");
    return {
      url: `https://github.com/login/oauth/authorize?scope=${this.ghConfig.dev.scope.join(
        ",",
      )}&client_id=${this.ghConfig.dev.clientID}`,
    };
  }

  @Post("github-login")
  @ApiOkResponse({
    description: "User has been authenticated successfully!",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(User) }),
  })
  @ApiNotFoundResponse({
    description: "User wallet not found",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async githubLogin(
    @Body() body: GithubLoginInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log("/github/github-login");
    const { wallet, code, role } = body;

    const { data: tokenParamsString } = await axios.get(
      `https://github.com/login/oauth/access_token?client_id=${this.ghConfig.dev.clientID}&client_secret=${this.ghConfig.dev.clientSecret}&code=${code}`,
    );

    const params = new URLSearchParams(tokenParamsString);
    const accessToken = params.get("access_token");

    const data = await axios
      .get<GithubAuthenticatedUserResponse>("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      .catch(err => {
        this.logger.error(
          `Github token request failed with error: ${err.response.data.message}`,
        );
      });

    if (!data) {
      return {
        success: false,
        message:
          "Github was unable to authenticate the user given the supplied challenge code",
      };
    }

    const profileData = data.data;

    const res1 = await this.githubUserService.addGithubInfoToUser({
      githubAccessToken: accessToken,
      githubRefreshToken: "",
      githubLogin: profileData.login,
      githubId: profileData.id.toString(),
      githubNodeId: profileData.node_id,
      githubGravatarId:
        profileData.gravatar_id === "" ? undefined : profileData.gravatar_id,
      githubAvatarUrl: profileData.avatar_url,
      wallet,
    });

    if (!res1.success) {
      return res1;
    }

    const CACHE_VALIDITY_THRESHOLD = this.configService.get<number>(
      "CACHE_VALIDITY_THRESHOLD",
    );

    const userCacheLock = await this.profileService.getUserCacheLock(wallet);

    const userCacheLockIsValid =
      (userCacheLock !== -1 || userCacheLock !== null) &&
      isBefore(
        new Date(),
        addMonths(new Date(userCacheLock), CACHE_VALIDITY_THRESHOLD),
      );

    if (!userCacheLockIsValid) {
      await this.profileService.refreshUserCacheLock([wallet]);

      const workHistory = await this.scorerService.getWorkHistory([
        profileData.login,
      ]);

      await this.profileService.refreshWorkHistoryCache(
        wallet,
        workHistory.find(x => x.user === profileData.login)?.workHistory ?? [],
      );
    }

    await this.userService.setWalletFlow({
      flow:
        role === CheckWalletRoles.DEV
          ? CheckWalletFlows.ONBOARD_REPO
          : CheckWalletFlows.ORG_PROFILE,
      wallet: wallet,
    });

    await this.userService.setWalletRole({
      role: role,
      wallet: wallet,
    });

    return {
      success: true,
      message: "Github connected successfully",
    };
  }
}
