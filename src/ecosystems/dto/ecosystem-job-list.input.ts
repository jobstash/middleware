import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { JobListParams } from "src/jobs/dto/job-list.input";

export class EcosystemJobListParams extends JobListParams {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  blocked?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  online?: boolean | null = null;
}
