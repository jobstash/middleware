import { IsNotEmpty } from "class-validator";

export class UpdateProjectCategoryDto {
  @IsNotEmpty()
  name: string;
}
