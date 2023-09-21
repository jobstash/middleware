import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Audit {
  public static readonly AuditType = t.strict({
    id: t.string,
    name: t.union([t.string, t.null]),
    defiId: t.union([t.string, t.null]),
    date: t.union([t.number, t.null]),
    techIssues: t.union([t.number, t.null]),
    link: t.union([t.string, t.null]),
    auditor: t.union([t.string, t.null, t.undefined]),
  });

  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  auditor: string | null;

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
    const { auditor, link, id, name, defiId, date, techIssues } = raw;
    const result = Audit.AuditType.decode(raw);
    this.auditor = auditor;
    this.link = link;
    this.id = id;
    this.name = name;
    this.defiId = defiId;
    this.date = date;
    this.techIssues = techIssues;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
