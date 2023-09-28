import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class JobpostOfflineStatus {
  public static readonly JobpostOfflineStatusType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  constructor(raw: JobpostOfflineStatus) {
    const { id, name } = raw;

    const result = JobpostOfflineStatus.JobpostOfflineStatusType.decode(raw);

    this.id = id;
    this.name = name;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
