import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { btoaList } from "src/shared/helpers";

export class AllJobsParams {
  @ApiPropertyOptional({
    example: "T3BlblNlYQ==,SmV0",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  organizations?: string[] | null = null;

  @ApiPropertyOptional({
    example: "T3BlblNlYQ==,SmV0",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  classifications?: string[] | null = null;
  @ApiPropertyOptional({
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number | null = null;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number | null = null;

  @ApiPropertyOptional({
    example: "C++",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string | null = null;
}
