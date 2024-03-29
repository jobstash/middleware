import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

const GMTTimezones = [
  "ASYNC",
  "GMT-12",
  "GMT-11",
  "GMT-10",
  "GMT-09",
  "GMT-08",
  "GMT-07",
  "GMT-06",
  "GMT-05",
  "GMT-04",
  "GMT-03",
  "GMT-02",
  "GMT-01",
  "GMT",
  "GMT+01",
  "GMT+02",
  "GMT+03",
  "GMT+04",
  "GMT+05",
  "GMT+06",
  "GMT+07",
  "GMT+08",
  "GMT+09",
  "GMT+10",
  "GMT+11",
  "GMT+12",
  "GMT+13",
  "GMT+14",
] as const;

const Timezone = t.keyof({
  ...GMTTimezones.reduce((acc, timezone) => ({ ...acc, [timezone]: null }), {}),
});
export class OrgStaffReview {
  public static readonly OrgStaffReviewType = t.strict({
    id: t.union([t.string, t.null]),
    title: t.union([t.string, t.null]),
    location: t.union([
      t.literal("ONSITE"),
      t.literal("REMOTE"),
      t.literal("HYBRID"),
      t.null,
    ]),
    timezone: t.union([Timezone, t.null]),
    pros: t.union([t.string, t.null]),
    cons: t.union([t.string, t.null]),
  });

  id: string | null;
  title: string | null;
  location: string | null;
  timezone: string | null;
  pros: string | null;
  cons: string | null;

  constructor(raw: OrgStaffReview) {
    const { id, title, pros, cons, location, timezone } = raw;

    const result = OrgStaffReview.OrgStaffReviewType.decode(raw);

    this.id = id;
    this.title = title;
    this.location = location;
    this.timezone = timezone;
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
