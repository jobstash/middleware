import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsUrl,
  IsEthereumAddress,
} from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsEthereumAddress()
  wallet?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}
