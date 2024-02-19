import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ReviewOrgInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  location: string | null;

  @ApiProperty()
  @IsString()
  @IsOptional()
  timezone: string | null;

  @ApiProperty()
  @IsString()
  @IsOptional()
  pros: string | null;

  @ApiProperty()
  @IsString()
  @IsOptional()
  cons: string | null;
}
