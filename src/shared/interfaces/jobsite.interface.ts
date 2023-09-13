import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class Jobsite {
  public static readonly JobsiteType = t.strict({
    id: t.string,
    url: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  constructor(raw: Jobsite) {
    const { id, url } = raw;

    const result = Jobsite.JobsiteType.decode(raw);

    this.id = id;
    this.url = url;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `jobsite instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
