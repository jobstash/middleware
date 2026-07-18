import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class ResolveEntityReviewInput {
  @ApiPropertyOptional({
    description: "Optional note recording how the manual review was resolved",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
