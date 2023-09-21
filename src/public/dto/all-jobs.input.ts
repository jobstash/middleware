import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional } from "class-validator";

export class AllJobsInput {
  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit: number;
}
