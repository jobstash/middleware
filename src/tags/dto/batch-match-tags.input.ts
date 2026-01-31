import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  Min,
  Max,
} from "class-validator";

export class BatchMatchTagsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  tags: string[];

  @ApiPropertyOptional({ default: 0.3, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  scoreThreshold?: number;
}
