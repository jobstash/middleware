import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Audit {
  public static readonly AuditType = t.strict({
    link: t.string,
    auditor: t.union([t.string, t.null, t.undefined]),
  });

  @ApiPropertyOptional()
  auditor: string | null;

  @ApiProperty()
  link: string;

  constructor(raw: Audit) {
    const { auditor, link } = raw;
    const result = Audit.AuditType.decode(raw);
    this.auditor = auditor;
    this.link = link;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
