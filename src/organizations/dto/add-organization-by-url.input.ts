import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class AddOrganizationByUrlInput {
  @ApiProperty()
  @IsOptional()
  @IsUrl()
  url: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
}
