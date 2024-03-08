import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class UpdateOrgAliasesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  aliases: string[];
}
