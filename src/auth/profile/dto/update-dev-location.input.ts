import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateDevLocationInput {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  country: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city: string | null;
}
