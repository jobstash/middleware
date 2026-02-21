import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsInt,
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

  @ApiPropertyOptional({ default: 0.5, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  scoreThreshold?: number;

  @ApiPropertyOptional({ default: 15, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxResults?: number;
}
