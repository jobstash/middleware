import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Hack } from "../interfaces";

export class HackEntity {
  constructor(private readonly raw: Hack) {}

  getProperties(): Hack {
    return new Hack({
      id: notStringOrNull(this.raw?.id),
      description: notStringOrNull(this.raw?.description),
      defiId: notStringOrNull(this.raw?.defiId),
      category: notStringOrNull(this.raw?.category),
      issueType: notStringOrNull(this.raw?.issueType),
      date: nonZeroOrNull(this.raw?.date),
      fundsLost: nonZeroOrNull(this.raw?.fundsLost),
      fundsReturned: nonZeroOrNull(this.raw?.fundsReturned),
    });
  }
}
