import {
  JobListResult,
  OrganizationWithRelations,
  StructuredJobpostWithRelations,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";

type RawJobPost = StructuredJobpostWithRelations & {
  organization?: OrganizationWithRelations | null;
};

export class JobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobListResult {
    const jobpost = this.raw;
    const { organization, tags } = jobpost;

    return new JobListResult({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      url: notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      summary: notStringOrNull(jobpost?.summary),
      description: notStringOrNull(jobpost?.description),
      commitment: notStringOrNull(jobpost?.commitment),
      firstSeenTimestamp: nonZeroOrNull(jobpost?.firstSeenTimestamp),
      lastSeenTimestamp: nonZeroOrNull(jobpost?.lastSeenTimestamp),
      publishedTimestamp: nonZeroOrNull(jobpost?.publishedTimestamp),
      organization: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        logoUrl: notStringOrNull(organization?.logoUrl),
        headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        website: notStringOrNull(organization?.website),
        alias: notStringOrNull(organization?.alias),
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
        investors:
          organization?.investors.map(investor => ({
            id: investor.id,
            name: investor.name,
          })) ?? [],
      },
      tags: tags ?? [],
    });
  }
}
