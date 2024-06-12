import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class SetupOrgLinkInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  clientId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;
}
