import { GithubProfile } from "src/shared/interfaces/github-profile.interface";

export class FindOrCreateUserInput {
  accessToken: string;
  refreshToken: string;
  profile: GithubProfile;
}
