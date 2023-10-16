import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgRating {
  public static readonly OrgRatingType = t.strict({
    management: t.union([t.number, t.null]),
    careerGrowth: t.union([t.number, t.null]),
    benefits: t.union([t.number, t.null]),
    workLifeBalance: t.union([t.number, t.null]),
    cultureValues: t.union([t.number, t.null]),
    diversityInclusion: t.union([t.number, t.null]),
    interviewProcess: t.union([t.number, t.null]),
  });

  management: number | null;
  careerGrowth: number | null;
  benefits: number | null;
  workLifeBalance: number | null;
  cultureValues: number | null;
  diversityInclusion: number | null;
  interviewProcess: number | null;

  constructor(raw: OrgRating) {
    const {
      management,
      careerGrowth,
      benefits,
      workLifeBalance,
      cultureValues,
      diversityInclusion,
      interviewProcess,
    } = raw;

    const result = OrgRating.OrgRatingType.decode(raw);

    this.management = management;
    this.careerGrowth = careerGrowth;
    this.benefits = benefits;
    this.workLifeBalance = workLifeBalance;
    this.cultureValues = cultureValues;
    this.diversityInclusion = diversityInclusion;
    this.interviewProcess = interviewProcess;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org ratings instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
