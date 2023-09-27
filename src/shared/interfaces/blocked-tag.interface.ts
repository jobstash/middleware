import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class BlockedTag {
  public static readonly BlockedTagType = t.strict({
    id: t.string,
    tagName: t.string,
    creatorWallet: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  tagName: string;

  @ApiProperty()
  creatorWallet: string;

  constructor(raw: BlockedTag) {
    const { id, tagName, creatorWallet } = raw;
    const result = BlockedTag.BlockedTagType.decode(raw);

    this.id = id;
    this.tagName = tagName;
    this.creatorWallet = creatorWallet;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
