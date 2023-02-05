import { User } from "./user.interface";

export interface AuthenticatedUser extends User {
  accessToken: string;
  refreshToken?: string;
}
