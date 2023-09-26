import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";

export class Discord {
  public static readonly DiscordType = t.strict({
    id: t.string,
    invite: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  invite: string;
}
