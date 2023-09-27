import { IsNotEmpty } from "class-validator";

export class UpdatePreferredTagDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
