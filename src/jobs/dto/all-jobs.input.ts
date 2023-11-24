import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsOptional, IsString } from "class-validator";
import { toList } from "src/shared/helpers";

export class AllJobsParams {
  @ApiPropertyOptional({
    example: "T3BlblNlYQ==,SmV0",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  organizations?: string[] | null = null;

  @ApiPropertyOptional({
    example: "T3BlblNlYQ==,SmV0",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  classifications?: string[] | null = null;

  @ApiPropertyOptional({
    example: "C++",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string | null = null;
}
