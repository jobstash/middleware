import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class PillarPageInput {
  @ApiProperty({
    description:
      "Pillar slug with prefix (e.g., 's-senior', 'o-company-name', 'i-investor-name')",
    example: "s-senior",
  })
  @IsString()
  @IsNotEmpty()
  slug: string;
}
