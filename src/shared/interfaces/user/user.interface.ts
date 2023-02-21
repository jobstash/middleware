import { GithubProfile } from "src/shared/types";

export interface User extends GithubProfile {
  wallet?: string;
  id: string;
  available?: boolean;
}
