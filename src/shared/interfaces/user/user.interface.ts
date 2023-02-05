import { GithubProfile, UserClaims } from "src/shared/types";

export interface User extends UserClaims, GithubProfile {
  password?: string;
}
