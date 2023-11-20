import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsPositive, IsString } from "class-validator";

export class CreateAuditDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  date: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  defiId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  link: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  techIssues: number;
}
