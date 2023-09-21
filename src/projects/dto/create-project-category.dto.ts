import { IsNotEmpty } from "class-validator";

export class CreateProjectCategoryDto {
  @IsNotEmpty()
  name: string;
}
