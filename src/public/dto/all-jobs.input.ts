import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, Max } from "class-validator";

export class AllJobsInput {
  @ApiPropertyOptional({
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Max(10)
  @Type(() => Number)
  limit: number;
}
