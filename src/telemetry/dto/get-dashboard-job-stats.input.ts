import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class GetDashboardJobStatsInput {
  @ApiProperty({
    description: "The type of stats to get",
    enum: ["ecosystem", "organization"],
  })
  @IsEnum(["ecosystem", "organization"])
  @IsNotEmpty()
  type: "ecosystem" | "organization";

  @ApiProperty({
    description: "The organization ID or ecosystem ID",
    example: "123",
  })
  @IsString()
  @IsNotEmpty()
  id: string;
}
