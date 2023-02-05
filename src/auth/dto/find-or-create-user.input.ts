import { GithubProfile } from "src/shared/types";

export class FindOrCreateUserInput {
  accessToken: string;
  refreshToken: string;
  profile: GithubProfile;
}
