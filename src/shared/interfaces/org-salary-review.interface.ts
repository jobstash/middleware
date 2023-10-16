import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgSalaryReview {
  public static readonly OrgSalaryReviewType = t.strict({
    offersTokenAllocation: t.boolean,
    amount: t.union([t.number, t.null]),
    selectedCurrency: t.union([t.string, t.null]),
  });

  selectedCurrency: string | null;
  amount: number | null;
  offersTokenAllocation: boolean;

  constructor(raw: OrgSalaryReview) {
    const { selectedCurrency, amount, offersTokenAllocation } = raw;

    const result = OrgSalaryReview.OrgSalaryReviewType.decode(raw);

    this.amount = amount;
    this.selectedCurrency = selectedCurrency;
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
