import { OrganizationWithRelations } from "../interfaces";
import {
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  notStringOrNull,
} from "../helpers";

export class OrganizationWithRelationsEntity {
  constructor(private readonly raw: OrganizationWithRelations) {}

  getProperties(): OrganizationWithRelations {
    const organization = this.raw;
    const reviews =
      organization?.reviews?.map(review =>
        generateOrgAggregateRating(review.rating),
      ) ?? [];

    return new OrganizationWithRelations({
      ...organization,
      aggregateRating:
        reviews.length > 0
          ? reviews.reduce((a, b) => a + b) / reviews.length
          : 0,
      aggregateRatings: generateOrgAggregateRatings(
        organization?.reviews?.map(x => x.rating) ?? [],
      ),
      reviewCount: reviews.length,
      docs: notStringOrNull(organization?.docs),
      logoUrl: notStringOrNull(organization?.logoUrl),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      website: notStringOrNull(organization?.website),
      alias: notStringOrNull(organization?.alias),
      community: organization?.community ?? [],
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
    });
  }
}
