import { OrganizationWithRelations } from "../interfaces";
import {
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  notStringOrNull,
} from "../helpers";
import { ProjectWithBaseRelationsEntity } from "./project.entity";

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
      aliases: organization?.aliases ?? [],
      community: organization?.community ?? [],
      grants:
        organization?.grants?.map(grant => ({
          ...grant,
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      fundingRounds:
        organization?.fundingRounds?.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
        })) ?? [],
      projects:
        organization?.projects?.map(project =>
          new ProjectWithBaseRelationsEntity(project).getProperties(),
        ) ?? [],
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
    });
  }
}
