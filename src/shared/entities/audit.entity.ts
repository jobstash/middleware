import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Audit } from "../interfaces";

export class AuditEntity {
  constructor(private readonly raw: Audit) {}

  getProperties(): Audit {
    return new Audit({
      id: notStringOrNull(this.raw?.id),
      name: notStringOrNull(this.raw?.name),
      defiId: notStringOrNull(this.raw?.defiId),
      link: notStringOrNull(this.raw?.link),
      date: nonZeroOrNull(this.raw?.date),
      techIssues: nonZeroOrNull(this.raw?.techIssues),
    });
  }
}
