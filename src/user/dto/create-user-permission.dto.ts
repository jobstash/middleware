import { IsNotEmpty } from "class-validator";

export class CreateUserPermissionDto {
  @IsNotEmpty()
  name: string;
}
