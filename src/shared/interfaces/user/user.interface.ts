import { GithubProfile } from "src/shared/types";

export class User extends GithubProfile {
  wallet?: string;
  id: string;
  available?: boolean;
}
