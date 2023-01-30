import { UserProperties } from "../../interfaces/user/user-properties.interface";

export interface AuthenticatedUser extends UserProperties {
  accessToken: string;
  refreshToken: string;
}
