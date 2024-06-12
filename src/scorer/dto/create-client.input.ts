import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl } from "class-validator";

export class CreateClientInput {
  @ApiProperty()
  @IsOptional()
  @IsString()
  apiToken: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @IsUrl({
    require_protocol: true,
    require_tld: true,
    require_valid_protocol: true,
    // host_whitelist: ["workable.com"],
    allow_fragments: false,
    allow_query_components: false,
    allow_trailing_dot: false,
  })
  workableUrl: string;
}
