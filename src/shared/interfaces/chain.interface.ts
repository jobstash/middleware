import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
export class Chain {
  public static readonly ChainType = t.strict({
    id: t.union([t.string, t.null]),
    name: t.union([t.string, t.null]),
    logo: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string | null;

  @ApiProperty()
  name: string | null;

  @ApiProperty()
  logo: string | null;

  constructor(raw: Chain) {
    const { id, name, logo } = raw;
    const result = Chain.ChainType.decode(raw);

    this.id = id;
    this.name = name;
    this.logo = logo;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `chain instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
