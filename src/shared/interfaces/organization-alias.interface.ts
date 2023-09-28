import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrganizationAlias {
  public static readonly OrganizationAliasType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name: string;

  constructor(raw: OrganizationAlias) {
    const { id, name } = raw;
    const result = OrganizationAlias.OrganizationAliasType.decode(raw);

    this.id = id;
    this.name = name;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `organization alias instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
