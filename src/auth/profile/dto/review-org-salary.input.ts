import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class ReviewOrgSalaryInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  currency: string | null;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  salary: number | null;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  offersTokenAllocation: boolean;
}
