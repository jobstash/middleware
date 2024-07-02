import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { UserOrg } from "../interfaces";

export class UserOrgEntity {
  constructor(private readonly raw: UserOrg) {}

  getProperties(): UserOrg {
    const {
      org: organization,
      membershipStatus,
      startDate,
      endDate,
      reviewedTimestamp,
      commitCount,
      compensation,
      rating,
      review,
    } = this.raw;
    return new UserOrg({
      org: {
        id: notStringOrNull(organization?.id),
        name: notStringOrNull(organization?.name),
        description: notStringOrNull(organization?.description),
        orgId: notStringOrNull(organization?.orgId),
        location: notStringOrNull(organization?.location),
        summary: notStringOrNull(organization?.summary),
        altName: notStringOrNull(organization?.altName),
        jobsiteLink: notStringOrNull(organization?.jobsiteLink),
        website: notStringOrNull(organization?.website),
        headCount: nonZeroOrNull(organization?.headCount),
        logo: notStringOrNull(organization?.logo),
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
        id: review.id,
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
