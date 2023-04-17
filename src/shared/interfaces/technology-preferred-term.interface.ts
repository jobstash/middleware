import { ApiProperty } from "@nestjs/swagger";
import { Technology } from "./technology.interface";

export class TechnologyPreferredTerm extends Technology {
  @ApiProperty()
  technology: Technology;
  @ApiProperty()
  synonyms: Technology[];
}
