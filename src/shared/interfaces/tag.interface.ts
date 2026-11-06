import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Tag {
  public static readonly TagType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
    createdTimestamp: t.union([
      t.refinement(t.number, Number.isFinite, "finite timestamp"),
      t.null,
    ]),
  });

  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  normalizedName: string;
  @ApiProperty()
  createdTimestamp: number | null;

  constructor(
    raw: Omit<Tag, "createdTimestamp"> & { createdTimestamp?: number | null },
  ) {
    const { id, name, normalizedName } = raw;
    const createdTimestamp = raw.createdTimestamp ?? null;
    const result = Tag.TagType.decode({ ...raw, createdTimestamp });

    this.id = id;
    this.name = name;
    this.normalizedName = normalizedName;
    this.createdTimestamp = createdTimestamp;
    if (isLeft(result)) {
      const errors = report(result);
      const paths = result.left.map(error =>
        error.context
          .map(entry => entry.key)
          .filter(Boolean)
          .join("."),
      );
      throw new Error(
        `tag instance with id ${this.id} failed validation with error '${errors.join("; ") || paths.join("; ")}'`,
      );
    }
  }
}
