import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Audit {
  public static readonly AuditType = t.strict({
    id: t.union([t.string, t.null]),
    name: t.union([t.string, t.null]),
    defiId: t.union([t.string, t.null]),
    date: t.union([t.number, t.null]),
    techIssues: t.union([t.number, t.null]),
    link: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string | null;

  @ApiPropertyOptional()
  link: string | null;

  @ApiPropertyOptional()
  name: string | null;

  @ApiPropertyOptional()
  defiId: string | null;

  @ApiPropertyOptional()
  date: number | null;

  @ApiPropertyOptional()
  techIssues: number | null;

  constructor(raw: Audit) {
    const { link, id, name, defiId, date, techIssues } = raw;
    const result = Audit.AuditType.decode(raw);
    this.link = link;
    this.id = id;
    this.name = name;
    this.defiId = defiId;
    this.date = date;
    this.techIssues = techIssues;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `audit instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
