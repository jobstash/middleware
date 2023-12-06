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
  selectedCurrency: string | null;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  amount: number | null;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  offersTokenAllocation: string;
}
