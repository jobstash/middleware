import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { WhiteLabelBoardSource } from "src/shared/interfaces/org";

export class CreateWhiteLabelBoardDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  route: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEnum(["organization", "ecosystem"])
  sourceType: WhiteLabelBoardSource;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  sourceSlug: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEnum(["public", "private"])
  visibility: "public" | "private";

  @ApiProperty()
  @IsString()
  @IsOptional()
  domain?: string | null = null;
}
