import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class DocSite {
  public static readonly DocsiteType = t.strict({
    id: t.string,
    url: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  constructor(raw: DocSite) {
    const { id, url } = raw;
    const result = DocSite.DocsiteType.decode(raw);
    this.id = id;
    this.url = url;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `docsite instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
