import { IsNotEmpty } from "class-validator";

export class CreateTechnologyDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
