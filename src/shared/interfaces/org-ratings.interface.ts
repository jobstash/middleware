import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgRating {
  public static readonly OrgRatingType = t.strict({
    onboarding: t.union([t.number, t.null]),
    careerGrowth: t.union([t.number, t.null]),
    benefits: t.union([t.number, t.null]),
    workLifeBalance: t.union([t.number, t.null]),
    diversityInclusion: t.union([t.number, t.null]),
    travel: t.union([t.number, t.null]),
  });

  onboarding: number | null;
  careerGrowth: number | null;
  benefits: number | null;
  workLifeBalance: number | null;
  diversityInclusion: number | null;
  travel: number | null;

  constructor(raw: OrgRating) {
    const {
      onboarding,
      careerGrowth,
      benefits,
      workLifeBalance,
      diversityInclusion,
      travel,
    } = raw;

    const result = OrgRating.OrgRatingType.decode(raw);

    this.onboarding = onboarding;
    this.careerGrowth = careerGrowth;
    this.benefits = benefits;
    this.workLifeBalance = workLifeBalance;
    this.diversityInclusion = diversityInclusion;
    this.travel = travel;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org ratings instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
