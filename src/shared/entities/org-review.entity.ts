import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { LeanOrgReview, OrgReview } from "../interfaces";

export class OrgReviewEntity {
  constructor(private readonly raw: OrgReview) {}

  getProperties(): OrgReview {
    const {
      membershipStatus,
      startDate,
      endDate,
      reviewedTimestamp,
      commitCount,
      compensation,
      rating,
      review,
    } = this.raw;
    return new OrgReview({
      membershipStatus: notStringOrNull(membershipStatus),
      startDate: nonZeroOrNull(startDate),
      endDate: nonZeroOrNull(endDate),
      commitCount: nonZeroOrNull(commitCount),
      compensation: {
        currency: notStringOrNull(compensation?.currency),
        salary: nonZeroOrNull(compensation?.salary),
        offersTokenAllocation: compensation?.offersTokenAllocation ?? false,
      },
      rating: {
        benefits: nonZeroOrNull(rating?.benefits),
        careerGrowth: nonZeroOrNull(rating?.careerGrowth),
        diversityInclusion: nonZeroOrNull(rating?.diversityInclusion),
        management: nonZeroOrNull(rating?.management),
        product: nonZeroOrNull(rating?.product),
        compensation: nonZeroOrNull(rating?.compensation),
        onboarding: nonZeroOrNull(rating?.onboarding),
        workLifeBalance: nonZeroOrNull(rating?.workLifeBalance),
      },
      review: {
        id: notStringOrNull(review?.id),
        title: notStringOrNull(review?.title),
        location: notStringOrNull(review?.location),
        timezone: notStringOrNull(review?.timezone),
        pros: notStringOrNull(review?.pros),
        cons: notStringOrNull(review?.cons),
      },
      reviewedTimestamp: nonZeroOrNull(reviewedTimestamp),
    });
  }
}

export class LeanOrgReviewEntity {
  constructor(private readonly raw: OrgReview) {}

  getProperties(): LeanOrgReview {
    const {
      membershipStatus,
      startDate,
      endDate,
      reviewedTimestamp,
      commitCount,
      review,
      rating,
    } = this.raw;
    return new LeanOrgReview({
      membershipStatus: notStringOrNull(membershipStatus),
      startDate: nonZeroOrNull(startDate),
      endDate: nonZeroOrNull(endDate),
      commitCount: nonZeroOrNull(commitCount),
      rating: rating,
      review: {
        id: notStringOrNull(review?.id),
        title: notStringOrNull(review?.title),
        location: notStringOrNull(review?.location),
        timezone: notStringOrNull(review?.timezone),
        pros: notStringOrNull(review?.pros),
        cons: notStringOrNull(review?.cons),
      },
      reviewedTimestamp: nonZeroOrNull(reviewedTimestamp),
    });
  }
}
