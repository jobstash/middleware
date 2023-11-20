import { IsNotEmpty } from "class-validator";

export class CreateUserRoleDto {
  @IsNotEmpty()
  name: string;
}
