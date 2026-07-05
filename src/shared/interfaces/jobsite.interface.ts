import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class Jobsite {
  public static readonly JobsiteType = t.strict({
    id: t.string,
    url: t.string,
    type: t.string,
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
    // optional: hiring process described on the careers page (null when the
    // page doesn't describe one); not every projection returns it
    hiringProcess: t.union([t.string, t.null, t.undefined]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional()
  createdTimestamp: number | null;

  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  @ApiPropertyOptional()
  hiringProcess?: string | null;

  constructor(raw: Jobsite) {
    const { id, url, type, createdTimestamp, updatedTimestamp, hiringProcess } =
      raw;

    const result = Jobsite.JobsiteType.decode(raw);

    this.id = id;
    this.url = url;
    this.type = type;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;
    this.hiringProcess = hiringProcess ?? null;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `jobsite instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
