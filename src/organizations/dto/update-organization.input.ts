import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateOrganizationInput } from "./create-organization.input";
import { IsArray, IsOptional } from "class-validator";

export class UpdateOrganizationInput extends OmitType(CreateOrganizationInput, [
  "orgId",
] as const) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  grants: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  projects: string[];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  communities: string[];
}
