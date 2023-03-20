import { GithubProfile } from "src/shared/types";
import {
  IsDefined,
  IsEthereumAddress,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";

export class CreateUserInput extends PartialType(GithubProfile) {
  @ApiProperty()
  @IsString()
  @IsDefined()
  @IsNotEmpty()
  githubAccessToken: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  githubRefreshToken?: string | undefined;

  @ApiProperty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsNumber()
  chainId: number;
}
