import { IsNotEmpty } from "class-validator";

export class CreateUserFlowDto {
  @IsNotEmpty()
  name: string;
}
