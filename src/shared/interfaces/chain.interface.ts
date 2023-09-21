import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
export class Chain {
  public static readonly ChainType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  constructor(raw: Chain) {
    const { id, name } = raw;
    const result = Chain.ChainType.decode(raw);

    this.id = id;
    this.name = name;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
