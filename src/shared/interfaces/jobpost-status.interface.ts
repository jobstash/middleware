import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class JobpostStatus {
  public static readonly JobpostStatusType = t.strict({
    id: t.string,
    status: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  constructor(raw: JobpostStatus) {
    const { id, status } = raw;

    const result = JobpostStatus.JobpostStatusType.decode(raw);

    this.id = id;
    this.status = status;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
