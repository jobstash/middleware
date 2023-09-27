import { IsNotEmpty } from "class-validator";

export class CreateTagDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  normalizedName: string;
}
