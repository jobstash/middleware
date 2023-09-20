import { IsNotEmpty } from "class-validator";

export class CreateTechnologyPreferredTermDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
