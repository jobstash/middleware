import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class Tag {
  public static readonly TagType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
  });

  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  normalizedName: string;

  constructor(raw: Tag) {
    const { id, name, normalizedName } = raw;
    const result = Tag.TagType.decode(raw);

    this.id = id;
    this.name = name;
    this.normalizedName = normalizedName;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `tag instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
