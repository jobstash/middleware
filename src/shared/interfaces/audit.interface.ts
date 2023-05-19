import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class Audit {
  @ApiPropertyOptional()
  auditor: string | null;

  @ApiProperty()
  link: string;
}
