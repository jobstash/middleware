import { IsEthereumAddress, IsBoolean, IsOptional } from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsEthereumAddress()
  wallet?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}
