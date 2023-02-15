import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { UserService } from "../user/user.service";
import { Strategy } from "passport-github2";
import { GithubProfile, User } from "src/shared/types";

@Injectable()
export class GithubOauthStrategy extends PassportStrategy(Strategy, "github") {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
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
    const profileData = profile["_json"] as GithubProfile;
    const result = await this.userService.find(profileData.node_id);
    if (result === undefined) {
      return this.userService
        .create({
          accessToken,
          refreshToken,
          profile: {
            login: profileData.login,
            id: profileData.id,
            node_id: profileData.node_id,
            gravatar_id: profileData.gravatar_id,
            avatar_url: profileData.avatar_url,
            company: profileData.company,
            public_repos: profileData.public_repos,
            hireable: profileData.hireable,
          },
        })
        .then(user => user.getProperties());
    } else {
      return (await result).getProperties();
    }
  }
}
