import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgSalaryReview {
  public static readonly OrgSalaryReviewType = t.strict({
    offersTokenAllocation: t.boolean,
    salary: t.union([t.number, t.null]),
    currency: t.union([t.string, t.null]),
  });

  currency: string | null;
  salary: number | null;
  offersTokenAllocation: boolean;

  constructor(raw: OrgSalaryReview) {
    const { currency, salary, offersTokenAllocation } = raw;

    const result = OrgSalaryReview.OrgSalaryReviewType.decode(raw);

    this.salary = salary;
    this.currency = currency;
    this.offersTokenAllocation = offersTokenAllocation;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org salary review instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
