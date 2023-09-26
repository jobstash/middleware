import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Auditor {
  public static readonly AuditorType = t.strict({
    id: t.string,
    name: t.union([t.string, t.null]),
    defiId: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name: string | null;

  @ApiPropertyOptional()
  defiId: string | null;

  constructor(raw: Auditor) {
    const { id, name, defiId } = raw;
    const result = Auditor.AuditorType.decode(raw);

    this.id = id;
    this.name = name;
    this.defiId = defiId;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `auditor instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
