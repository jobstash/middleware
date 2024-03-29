import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class TagPair {
  public static readonly PairedTagType = t.strict({
    tag: t.string,
    pairings: t.array(t.string),
  });

  @ApiProperty()
  tag: string;

  @ApiProperty()
  pairings: string[];

  constructor(raw: TagPair) {
    const { tag, pairings } = raw;
    const result = TagPair.PairedTagType.decode(raw);

    this.tag = tag;
    this.pairings = pairings;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `paired tag instance with id ${this.tag} failed validation with error '${x}'`,
        );
      });
    }
  }
}
