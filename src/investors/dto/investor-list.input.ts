import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsNumber } from "class-validator";
import { Type } from "class-transformer";

export class InvestorListParams {
  @ApiPropertyOptional({
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number | null = null;

  @ApiPropertyOptional({
    example: 2000,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number | null = null;
}
