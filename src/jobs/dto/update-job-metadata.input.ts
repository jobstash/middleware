import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from "class-validator";

export class UpdateJobMetadataInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  benefits: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  requirements: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  responsibilities: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  salary: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  summary: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  culture: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  seniority: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  paysInCrypto: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  minimumSalary: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  maximumSalary: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  salaryCurrency: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  offersTokenAllocation: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  commitment: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  classification: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationType: string;
}
