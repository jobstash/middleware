import { ApiProperty, OmitType } from "@nestjs/swagger";
import { User } from "./user.interface";

export class AuthenticatedUser extends OmitType(User, ["id"] as const) {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  refreshToken?: string;
}
