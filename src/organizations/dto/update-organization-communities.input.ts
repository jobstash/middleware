import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class UpdateOrgCommunitiesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  communities: string[];
}
