import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Website {
  public static readonly WebsiteType = t.strict({
    id: t.string,
    url: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  constructor(raw: Website) {
    const { id, url } = raw;
    const result = Website.WebsiteType.decode(raw);
    this.id = id;
    this.url = url;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `website instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
