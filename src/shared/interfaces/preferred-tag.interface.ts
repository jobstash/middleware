import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
import { Tag } from "./tag.interface";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
// import { isLeft } from "fp-ts/lib/Either";

export class PreferredTag extends Tag {
  public static readonly PreferredTagType = t.strict({
    tag: Tag.TagType,
    synonyms: t.array(Tag.TagType),
  });

  @ApiProperty()
  tag: Tag;
  @ApiProperty()
  synonyms: Tag[];

  constructor(raw: PreferredTag) {
    super(raw);

    const { tag, synonyms } = raw;
    const result = PreferredTag.PreferredTagType.decode(raw);

    this.tag = tag;
    this.synonyms = synonyms;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `preferred tag instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
