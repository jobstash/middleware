import { GithubProfile } from "src/shared/types";

export class CreateUserInput {
  accessToken: string;
  refreshToken: string;
  profile: GithubProfile;
}
