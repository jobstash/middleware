import { IsNotEmpty, IsString } from "class-validator";

export class LinkTagSynonymDto {
  @IsNotEmpty()
  @IsString()
  tagName: string;

  @IsNotEmpty()
  @IsString()
  synonymName: string;
}
