import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsString } from "class-validator";
import { ATSPreferences } from "src/shared/interfaces";

export class SetupOrgLinkInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  clientId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsObject()
  preferences: ATSPreferences;
}
