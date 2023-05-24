import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class Audit {
  public static readonly AuditType = t.strict({
    link: t.string,
    auditor: t.union([t.string, t.null]),
  });

  @ApiPropertyOptional()
  auditor: string | null;

  @ApiProperty()
  link: string;

  // constructor(raw: Audit) {
  //   const { auditor, link } = raw;
  //   const result = Audit.AuditType.decode(raw);
  //   this.auditor = auditor;
  //   this.link = link;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing Audit! Constructor expected: \n {
  //     link: string,
  //     auditor: string | null,
  //   }
  //   got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
