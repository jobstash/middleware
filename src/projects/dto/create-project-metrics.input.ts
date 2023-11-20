import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class CreateProjectMetricsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  monthlyFees: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  monthlyVolume: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  monthlyRevenue: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  monthlyActiveUsers: number;
}
