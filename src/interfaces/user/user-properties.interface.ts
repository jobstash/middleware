import { GithubProfile } from "../../shared/github-profile.entity";

export interface UserProperties {
  email: string;
  password: string;
  profile: GithubProfile;
}
