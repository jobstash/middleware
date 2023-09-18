import { IsNotEmpty, IsString } from "class-validator";

export class LoadRepositorydataRequestDto {
  @IsNotEmpty()
  @IsString()
  authToken: string;
}
