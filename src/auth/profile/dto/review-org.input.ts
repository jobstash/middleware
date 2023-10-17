import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ReviewOrgInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  headline: string | null;

  @ApiProperty()
  @IsString()
  @IsOptional()
  pros: string | null;

  @ApiProperty()
  @IsString()
  @IsOptional()
  cons: string | null;
}
