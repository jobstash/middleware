import { PartialType } from "@nestjs/mapped-types";
import { JobListParams } from "./job-list.input";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class SearchJobsListParams extends PartialType(JobListParams) {
  @ApiPropertyOptional({
    example: "String,C++",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string;
}
