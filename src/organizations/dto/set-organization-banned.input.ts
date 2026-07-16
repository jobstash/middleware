import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class SetOrganizationBannedInput {
  @ApiProperty({
    description: "Whether this organization is permanently banned",
  })
  @IsBoolean()
  banned: boolean;

  @ApiPropertyOptional({ description: "Operator reason for the ban" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
