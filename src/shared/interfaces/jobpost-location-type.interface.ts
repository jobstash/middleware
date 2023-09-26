import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class JobpostLocationType {
  public static readonly JobpostLocationTypeType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  constructor(raw: JobpostLocationType) {
    const { id, name } = raw;
    this.id = id;
    this.name = name;

    const result = JobpostLocationType.JobpostLocationTypeType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `jobpost location type instance with id ${this.name} failed validation with error '${x}'`,
        );
      });
    }
  }
}
