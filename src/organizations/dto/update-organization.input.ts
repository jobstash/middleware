import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateOrganizationInput } from "./create-organization.input";
import { IsOptional, IsString } from "class-validator";

export class UpdateOrganizationInput extends OmitType(CreateOrganizationInput, [
  "orgId",
] as const) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grants: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projects: string[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  communities: string[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  jobsites: string[];
}
