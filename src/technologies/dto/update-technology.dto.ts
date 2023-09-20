import { IsNotEmpty } from "class-validator";

export class UpdateTechnologyDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
