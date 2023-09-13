import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Investor {
  public static readonly InvestorType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  constructor(raw: Investor) {
    const { id, name } = raw;
    const result = Investor.InvestorType.decode(raw);

    this.id = id;
    this.name = name;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `investor instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
