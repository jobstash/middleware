import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class GetDashboardTalentStatsInput {
  @ApiProperty({
    description: "The organization ID or ecosystem ID",
    example: "123",
  })
  @IsString()
  @IsNotEmpty()
  id: string;
}
