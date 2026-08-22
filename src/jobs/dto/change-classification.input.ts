import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsNotEmpty, IsString } from "class-validator";
import { CANONICAL_JOB_CLASSIFICATION_CODES } from "src/shared/constants";

export class ChangeJobClassificationInput {
  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  shortUUIDs: string[];

  @ApiProperty({ enum: CANONICAL_JOB_CLASSIFICATION_CODES })
  @IsString()
  @IsNotEmpty()
  @IsIn(CANONICAL_JOB_CLASSIFICATION_CODES)
  classification: string;
}
