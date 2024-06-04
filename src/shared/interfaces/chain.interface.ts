import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
export class Chain {
  public static readonly ChainType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
    logo: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  normalizedName: string;

  @ApiProperty()
  logo: string | null;

  constructor(raw: Chain) {
    const { id, name, normalizedName, logo } = raw;
    const result = Chain.ChainType.decode(raw);

    this.id = id;
    this.name = name;
    this.normalizedName = normalizedName;
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
