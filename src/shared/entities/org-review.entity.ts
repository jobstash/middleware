import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { OrgReview } from "../interfaces";

export class OrgReviewEntity {
  constructor(private readonly raw: OrgReview) {}

  getProperties(): OrgReview {
    const {
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
      membershipStatus: notStringOrNull(membershipStatus),
      startDate: nonZeroOrNull(startDate),
      endDate: nonZeroOrNull(endDate),
      commitCount: nonZeroOrNull(commitCount),
      salary: {
        selectedCurrency: notStringOrNull(salary?.selectedCurrency),
        amount: nonZeroOrNull(salary?.amount),
        offersTokenAllocation: salary?.offersTokenAllocation ?? false,
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
      reviewedTimestamp: nonZeroOrNull(reviewedTimestamp),
    });
  }
}
