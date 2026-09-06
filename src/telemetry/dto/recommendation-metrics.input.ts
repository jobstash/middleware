import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class RecommendationMetricsInput {
  @Type(() => Number) @IsInt() @Min(1) @Max(90) days = 30;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) k = 3;
}
