import { ApiProperty } from "@nestjs/swagger";

export class PairedTerm {
  @ApiProperty()
  technology: string;

  @ApiProperty()
  pairings: string[];
}
