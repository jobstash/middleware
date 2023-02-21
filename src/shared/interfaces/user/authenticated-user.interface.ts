import { OmitType } from "@nestjs/swagger";
import { User } from "./user.interface";

export class AuthenticatedUser extends OmitType(User, ["id"] as const) {
  access_token: string;
  refresh_token?: string;
}
