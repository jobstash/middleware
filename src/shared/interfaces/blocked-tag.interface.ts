import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class TechnologyBlockedTerm {
  public static readonly TechnologyBlockedTermType = t.strict({
    id: t.string,
  });

  @ApiProperty()
  id: string;

  constructor(raw: TechnologyBlockedTerm) {
    const { id } = raw;
    const result = TechnologyBlockedTerm.TechnologyBlockedTermType.decode(raw);

    this.id = id;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
