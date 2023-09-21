import { IsNotEmpty, IsString } from "class-validator";

export class LinkTechnologySynonymDto {
  @IsNotEmpty()
  @IsString()
  technologyName: string;

  @IsNotEmpty()
  @IsString()
  synonymName: string;
}
