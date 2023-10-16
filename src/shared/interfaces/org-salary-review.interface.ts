import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgSalaryReview {
  public static readonly OrgSalaryReviewType = t.strict({
    currency: t.strict({
      value: t.union([t.string, t.null]),
      options: t.array(t.string),
    }),
    amount: t.union([t.number, t.null]),
    token: t.strict({
      value: t.union([t.string, t.null]),
      options: t.array(t.string),
      noAllocation: t.boolean,
    }),
  });

  currency: {
    value: string | null;
    options: string[];
  };
  amount: number | null;
  token: {
    value: string | null;
    options: string[];
    noAllocation: boolean;
  };

  constructor(raw: OrgSalaryReview) {
    const { currency, amount, token } = raw;

    const result = OrgSalaryReview.OrgSalaryReviewType.decode(raw);

    this.token = token;
    this.amount = amount;
    this.currency = currency;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org salary review instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
