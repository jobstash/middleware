import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { UserService } from "../user/user.service";
import { Strategy } from "passport-github2";
import { User } from "src/shared/types";
import { BackendService } from "src/backend/backend.service";

@Injectable()
export class GithubOauthStrategy extends PassportStrategy(Strategy, "github") {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly backendService: BackendService,
  ) {
    super({
      clientID: configService.get<string>("GITHUB_OAUTH_CLIENT_ID"),
      clientSecret: configService.get<string>("GITHUB_OAUTH_CLIENT_SECRET"),
      callbackURL: configService.get<string>("GITHUB_OAUTH_CALLBACK_URL"),
      scope: ["read:user", "read:org"],
    });
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: object,
  ): Promise<User> {
    const profileData = profile["_json"];
    const result = await this.userService.findByNodeId(profileData.node_id);
    if (result === undefined) {
      return this.backendService.createUser({
        githubAccessToken: accessToken,
        githubRefreshToken: refreshToken,
        githubLogin: profileData.login,
        githubId: profileData.id,
        githubNodeId: profileData.node_id,
        githubGravatarId:
          profileData.gravatar_id === "" ? undefined : profileData.gravatar_id,
        githubAvatarUrl: profileData.avatar_url,
      });
    } else {
      return result.getProperties();
    }
  }
}
