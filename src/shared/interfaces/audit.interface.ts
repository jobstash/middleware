import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class Audit {
  @ApiPropertyOptional()
  auditor?: string;

  @ApiProperty()
  link: string;
}
