import {
  JobDetailsResult,
  OrganizationWithRelations,
  StructuredJobpostWithRelations,
} from "../interfaces";
import {
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  notStringOrNull,
} from "../helpers";
import { OrgReviewEntity } from "./org-review.entity";
import { isAfter, isBefore } from "date-fns";
import { uniqBy } from "lodash";

type RawJobPost = StructuredJobpostWithRelations & {
  organization?:
    | (OrganizationWithRelations & {
        hasUser: boolean;
        atsClient: "jobstash" | "greenhouse" | "workable" | "lever" | null;
      })
    | null;
};

export class JobDetailsEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(protectLink = true): JobDetailsResult {
    const jobpost = this.raw;
    const { organization, tags } = jobpost;
    const reviews =
      organization?.reviews?.map(review =>
        generateOrgAggregateRating(review.rating),
      ) ?? [];

    const now = new Date().getTime();

    const isStillFeatured =
      jobpost?.featured === true &&
      isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
      isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

    return new JobDetailsResult({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      url: protectLink
        ? jobpost?.access === "protected"
          ? null
          : notStringOrNull(jobpost?.url)
        : notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      summary: notStringOrNull(jobpost?.summary),
      description: notStringOrNull(jobpost?.description),
      commitment: notStringOrNull(jobpost?.commitment),
      timestamp: nonZeroOrNull(jobpost?.timestamp),
      featureStartDate: isStillFeatured
        ? nonZeroOrNull(jobpost?.featureStartDate)
        : null,
      featureEndDate: isStillFeatured
        ? nonZeroOrNull(jobpost?.featureEndDate)
        : null,
      featured: isStillFeatured,
      organization: {
        ...organization,
        aggregateRating:
          reviews.length > 0
            ? reviews.reduce((a, b) => a + b) / reviews.length
            : 0,
        aggregateRatings: generateOrgAggregateRatings(
          organization?.reviews?.map(x => x.rating) ?? [],
        ),
        reviewCount: reviews.length,
        hasUser: organization?.hasUser ?? false,
        atsClient: organization?.atsClient ?? null,
        docs: notStringOrNull(organization?.docs),
        logoUrl: notStringOrNull(organization?.logoUrl),
        headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        website: notStringOrNull(organization?.website),
        aliases: organization?.aliases ?? [],
        createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
        projects:
          organization?.projects?.map(project => ({
            ...project,
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
            category: notStringOrNull(project?.category),
            github: notStringOrNull(project?.github),
            updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
            createdTimestamp: nonZeroOrNull(project?.createdTimestamp),
            hacks:
              project?.hacks?.map(hack => ({
                ...hack,
                id: notStringOrNull(hack?.id),
                defiId: notStringOrNull(hack?.defiId),
                category: notStringOrNull(hack?.category),
                fundsLost: nonZeroOrNull(hack?.fundsLost),
                date: nonZeroOrNull(hack?.date),
                issueType: notStringOrNull(hack?.issueType),
                description: notStringOrNull(hack?.description),
                fundsReturned: nonZeroOrNull(hack?.fundsReturned),
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
              project.chains.map(chain => ({
                ...chain,
                logo: notStringOrNull(chain?.logo),
              })) ?? [],
            jobs:
              project?.jobs?.map(jobpost => {
                const now = new Date().getTime();

                const isStillFeatured =
                  jobpost?.featured === true &&
                  isAfter(
                    now,
                    nonZeroOrNull(jobpost?.featureStartDate) ?? now,
                  ) &&
                  isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

                return {
                  ...jobpost,
                  salary: nonZeroOrNull(jobpost?.salary),
                  minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
                  maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
                  seniority: notStringOrNull(jobpost?.seniority, [
                    "",
                    "undefined",
                  ]),
                  culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
                  salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
                  paysInCrypto: jobpost?.paysInCrypto ?? null,
                  offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
                  featureStartDate: isStillFeatured
                    ? nonZeroOrNull(jobpost?.featureStartDate)
                    : null,
                  featureEndDate: isStillFeatured
                    ? nonZeroOrNull(jobpost?.featureEndDate)
                    : null,
                  featured: isStillFeatured,
                  url:
                    jobpost?.access === "protected"
                      ? null
                      : notStringOrNull(jobpost?.url),
                  title: notStringOrNull(jobpost?.title),
                  summary: notStringOrNull(jobpost?.summary),
                  description: notStringOrNull(jobpost?.description),
                  commitment: notStringOrNull(jobpost?.commitment),
                  timestamp: nonZeroOrNull(jobpost?.timestamp),
                };
              }) ?? [],
            repos: project?.repos?.map(repo => ({ ...repo })) ?? [],
            investors: Array.from(
              uniqBy(
                project?.investors ??
                  organization?.investors?.map(investor => ({
                    id: investor.id,
                    name: investor.name,
                    normalizedName: investor.normalizedName,
                  })) ??
                  [],
                "id",
              ),
            ),
          })) ?? [],
        fundingRounds:
          organization?.fundingRounds
            ?.map(fr => ({
              ...fr,
              raisedAmount: nonZeroOrNull(fr?.raisedAmount),
              createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
              roundName: notStringOrNull(fr?.roundName),
              sourceLink: notStringOrNull(fr?.sourceLink),
            }))
            .sort((a, b) => b.date - a.date) ?? [],
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
        community: organization?.community ?? [],
        reviews:
          organization?.reviews?.map(review =>
            new OrgReviewEntity(review).getProperties(),
          ) ?? [],
      },
      tags: tags ?? [],
    });
  }
}
