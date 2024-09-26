import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsNumber, IsOptional, Max } from "class-validator";
import { toList } from "src/shared/helpers";

export class AllJobsInput {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  organizations?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  category?: string[] | null = null;

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
