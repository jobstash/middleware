import { ApiProperty } from "@nestjs/swagger";
import { StructuredJobpost } from "./structured-jobpost.interface";

export class JobDetailsResult {
  @ApiProperty()
  organization: string;
  @ApiProperty()
  project: string;
  @ApiProperty()
  repository?: string | null;
  @ApiProperty()
  jobpost: StructuredJobpost;
}
