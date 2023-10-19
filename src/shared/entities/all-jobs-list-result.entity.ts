import {
  OrganizationWithRelations,
  StructuredJobpostWithRelations,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { AllJobsListResult } from "../interfaces/all-jobs-list-result.interface";

type RawJobPost = StructuredJobpostWithRelations & {
  organization?: OrganizationWithRelations | null;
};

export class AllJobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): AllJobsListResult {
    const jobpost = this.raw;
    const { organization, tags } = jobpost;

    return new AllJobsListResult({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      commitment: notStringOrNull(jobpost?.commitment),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      firstSeenTimestamp: nonZeroOrNull(jobpost?.firstSeenTimestamp),
      lastSeenTimestamp: nonZeroOrNull(jobpost?.lastSeenTimestamp),
      url: notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      organization: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        logoUrl: notStringOrNull(organization?.logoUrl),
        headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        alias: notStringOrNull(organization?.alias),
        website: notStringOrNull(organization?.website),
        createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
        projects:
          organization.projects.map(project => ({
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
              project?.hacks.map(hack => ({
                ...hack,
                id: notStringOrNull(hack?.id),
                defiId: notStringOrNull(hack?.defiId),
                category: nonZeroOrNull(hack?.category),
                fundsLost: nonZeroOrNull(hack?.fundsLost),
                date: notStringOrNull(hack?.date),
                issueType: notStringOrNull(hack?.issueType),
                description: notStringOrNull(hack?.description),
                fundsReturned: nonZeroOrNull(hack?.fundsReturned),
              })) ?? [],
            audits:
              project?.audits.map(audit => ({
                ...audit,
                id: notStringOrNull(audit?.id),
                name: notStringOrNull(audit?.name),
                defiId: notStringOrNull(audit?.defiId),
                date: nonZeroOrNull(audit?.date),
                techIssues: nonZeroOrNull(audit?.techIssues),
                link: notStringOrNull(audit?.link),
              })) ?? [],
            chains:
              project?.chains.map(chain => ({
                id: notStringOrNull(chain?.id),
                name: notStringOrNull(chain?.name),
              })) ?? [],
          })) ?? [],
        investors:
          organization?.investors.map(investor => ({
            id: investor.id,
            name: investor.name,
          })) ?? [],
        fundingRounds:
          organization?.fundingRounds
            .map(fr => ({
              ...fr,
              raisedAmount: nonZeroOrNull(fr?.raisedAmount),
              createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
              roundName: notStringOrNull(fr?.roundName),
              sourceLink: notStringOrNull(fr?.sourceLink),
            }))
            .sort((a, b) => b.date - a.date) ?? [],
      },
      tags: tags ?? [],
    });
  }
}
