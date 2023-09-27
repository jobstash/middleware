import { IsNotEmpty } from "class-validator";

export class CreatePreferredTagDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
