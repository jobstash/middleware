import {
  IsEthereumAddress,
  IsBoolean,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsEthereumAddress()
  wallet?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  name?: string;
}
