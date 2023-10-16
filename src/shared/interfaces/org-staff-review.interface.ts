import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgStaffReview {
  public static readonly OrgStaffReviewType = t.strict({
    headline: t.union([t.string, t.null]),
    pros: t.union([t.string, t.null]),
    cons: t.union([t.string, t.null]),
  });

  headline: string | null;
  pros: string | null;
  cons: string | null;

  constructor(raw: OrgStaffReview) {
    const { headline, pros, cons } = raw;

    const result = OrgStaffReview.OrgStaffReviewType.decode(raw);

    this.headline = headline;
    this.pros = pros;
    this.cons = cons;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org staff review instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
