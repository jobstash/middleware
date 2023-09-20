import { IsNotEmpty } from "class-validator";

export class UpdateTechnologyPreferredTermDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
