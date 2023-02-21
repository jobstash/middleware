import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GithubProfile } from "src/shared/types";

export class User extends GithubProfile {
  @ApiPropertyOptional()
  wallet?: string;
  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  available?: boolean;
}
