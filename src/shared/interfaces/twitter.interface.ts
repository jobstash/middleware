import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Twitter {
  public static readonly TwitterType = t.strict({
    id: t.string,
    username: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  constructor(raw: Twitter) {
    const { id, username } = raw;
    const result = Twitter.TwitterType.decode(raw);
    this.id = id;
    this.username = username;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `twitter instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
