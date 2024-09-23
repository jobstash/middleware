import { IsEthereumAddress, IsOptional, IsString } from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsEthereumAddress()
  wallet?: string;

  @IsOptional()
  @IsString()
  privyId?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
