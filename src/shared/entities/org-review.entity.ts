import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { OrgReview } from "../interfaces";

export class OrgReviewEntity {
  constructor(private readonly raw: OrgReview) {}

  getProperties(): OrgReview {
    const {
      org: organization,
      membershipStatus,
      startDate,
      endDate,
      reviewedTimestamp,
      commitCount,
      salary,
      rating,
      review,
    } = this.raw;
    return new OrgReview({
      org: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      },
      membershipStatus: notStringOrNull(membershipStatus),
      startDate: nonZeroOrNull(startDate),
      endDate: nonZeroOrNull(endDate),
      commitCount: nonZeroOrNull(commitCount),
      salary: {
        currency: {
          options: salary?.currency?.options ?? [],
          value: notStringOrNull(salary?.currency?.value),
        },
        amount: nonZeroOrNull(salary?.amount),
        token: {
          options: salary?.token?.options ?? [],
          value: notStringOrNull(salary?.token?.value),
          noAllocation: salary?.token?.noAllocation ?? false,
        },
      },
      rating: {
        benefits: nonZeroOrNull(rating?.benefits),
        careerGrowth: nonZeroOrNull(rating?.careerGrowth),
        cultureValues: nonZeroOrNull(rating?.cultureValues),
        diversityInclusion: nonZeroOrNull(rating?.diversityInclusion),
        interviewProcess: nonZeroOrNull(rating?.interviewProcess),
        management: nonZeroOrNull(rating?.management),
        workLifeBalance: nonZeroOrNull(rating?.workLifeBalance),
      },
      review: {
        headline: notStringOrNull(review?.headline),
        pros: notStringOrNull(review?.pros),
        cons: notStringOrNull(review?.cons),
      },
      reviewedTimestamp: reviewedTimestamp,
    });
  }
}
