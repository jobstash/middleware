import { IsNotEmpty, IsString } from "class-validator";

export class CheckOrgMembershipDTO {
  @IsNotEmpty()
  @IsString()
  requestorAuthToken: string;

  @IsNotEmpty()
  @IsString()
  orgName: string;

  @IsNotEmpty()
  @IsString()
  githubUserName: string;
}
