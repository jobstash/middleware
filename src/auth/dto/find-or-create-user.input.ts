import { GithubProfile } from "src/shared/github-profile.entity";

export class FindOrCreateUserInput {
  accessToken: string;
  refreshToken: string;
  profile: GithubProfile;
}
