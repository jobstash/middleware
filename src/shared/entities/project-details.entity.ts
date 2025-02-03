import { OrganizationWithRelations, Tag } from "../interfaces";
import {
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  notStringOrNull,
} from "../helpers";
import { ProjectDetailsResult } from "../interfaces/project-details-result.interface";
import { OrgReviewEntity } from "./org-review.entity";
import { uniqBy } from "lodash";

type RawProject = ProjectDetailsResult & {
  organization?: (OrganizationWithRelations & { tags: Tag[] }) | null;
};

export class ProjectDetailsEntity {
  constructor(private readonly raw: RawProject) {}

  getProperties(): ProjectDetailsResult {
    const { organization, ...project } = this.raw;
    const reviews =
      organization?.reviews?.map(review =>
        generateOrgAggregateRating(review.rating),
      ) ?? [];

    return new ProjectDetailsResult({
      ...project,
      orgIds: project?.orgIds ?? [],
      defiLlamaId: notStringOrNull(project?.defiLlamaId),
      defiLlamaSlug: notStringOrNull(project?.defiLlamaSlug),
      defiLlamaParent: notStringOrNull(project?.defiLlamaParent),
      tokenAddress: notStringOrNull(project?.tokenAddress),
      tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
      tvl: nonZeroOrNull(project?.tvl),
      monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
      monthlyFees: nonZeroOrNull(project?.monthlyFees),
      monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
      monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
      telegram: notStringOrNull(project?.telegram),
      logo: notStringOrNull(project?.logo),
      twitter: notStringOrNull(project?.twitter),
      discord: notStringOrNull(project?.discord),
      docs: notStringOrNull(project?.docs),
      github: notStringOrNull(project?.github),
      isMainnet: project?.isMainnet ?? null,
      createdTimestamp: nonZeroOrNull(project?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
      hacks:
        project?.hacks?.map(hack => ({
          ...hack,
          fundsLost: hack.fundsLost,
          date: nonZeroOrNull(hack.date),
          description: notStringOrNull(hack.description),
          fundsReturned: nonZeroOrNull(hack.fundsReturned),
        })) ?? [],
      audits:
        project?.audits?.map(audit => ({
          ...audit,
          id: notStringOrNull(audit?.id),
          name: notStringOrNull(audit?.name),
          defiId: notStringOrNull(audit?.defiId),
          date: nonZeroOrNull(audit?.date),
          techIssues: nonZeroOrNull(audit?.techIssues),
          link: notStringOrNull(audit?.link),
        })) ?? [],
      chains:
        project?.chains?.map(chain => ({
          ...chain,
          logo: notStringOrNull(chain?.logo),
        })) ?? [],
      ecosystems: project.ecosystems ?? [],
      organizations: project?.organizations?.map(organization => ({
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
        createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
        fundingRounds:
          organization?.fundingRounds.map(fr => ({
            ...fr,
            raisedAmount: nonZeroOrNull(fr?.raisedAmount),
            roundName: notStringOrNull(fr?.roundName),
            sourceLink: notStringOrNull(fr?.sourceLink),
            createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
          })) ?? [],
        grants:
          organization?.grants?.map(grant => ({
            ...grant,
            //TODO: remove this once we have a better way to handle this
            programName: notStringOrNull(grant?.programName) ?? "N/A",
            createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
            fundingDate: nonZeroOrNull(grant?.fundingDate),
            amount: nonZeroOrNull(grant?.amount),
          })) ?? [],
        community: organization?.community ?? [],
        ecosystems: organization?.ecosystems ?? [],
        investors: Array.from(
          uniqBy(
            organization?.investors?.map(investor => ({
              id: investor.id,
              name: investor.name,
              normalizedName: investor.normalizedName,
            })) ?? [],
            "id",
          ),
        ),
        tags: organization?.tags ?? [],
        projects: [],
        reviews:
          organization?.reviews.map(review =>
            new OrgReviewEntity(review).getProperties(),
          ) ?? [],
      })),
      repos:
        project?.repos?.map(repo => ({
          ...repo,
          pushedAt: nonZeroOrNull(repo.pushedAt),
          updatedAt: nonZeroOrNull(repo.updatedAt),
          createdAt: nonZeroOrNull(repo.createdAt),
        })) ?? [],
      grants:
        project?.grants?.map(grant => ({
          ...grant,
          //TODO: remove this once we have a better way to handle this
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      fundingRounds:
        project?.fundingRounds?.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
        })) ?? [],
    });
  }
}
