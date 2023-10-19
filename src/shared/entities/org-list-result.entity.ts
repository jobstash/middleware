import {
  FundingRound,
  OrganizationWithRelations,
  ProjectMoreInfo,
  StructuredJobpostWithRelations,
  Tag,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { OrgListResult } from "../interfaces/org-list-result.interface";
import { Investor } from "../interfaces/investor.interface";

type RawOrg = OrganizationWithRelations & {
  jobs?: StructuredJobpostWithRelations[] | null;
  tags: Tag[];
  projects?: ProjectMoreInfo[] | null;
  investors?: Investor[] | null;
  fundingRounds?: FundingRound[] | null;
};

export class OrgListResultEntity {
  constructor(private readonly raw: RawOrg) {}

  getProperties(): OrgListResult {
    const organization = this.raw;
    const { jobs, investors, fundingRounds, projects, tags } = organization;

    return new OrgListResult({
      ...organization,
      docs: notStringOrNull(organization?.docs),
      logoUrl: notStringOrNull(organization?.logoUrl),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      projects:
        projects.map(project => ({
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
          isMainnet: project?.isMainnet ?? null,
          docs: notStringOrNull(project?.docs),
          github: notStringOrNull(project?.github),
          createdTimestamp: nonZeroOrNull(project?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
          hacks:
            project?.hacks.map(hack => ({
              ...hack,
              fundsLost: hack.fundsLost,
              date: notStringOrNull(hack.date),
              description: notStringOrNull(hack.description),
              fundsReturned: nonZeroOrNull(hack.fundsReturned),
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
          chains: project?.chains ?? [],
        })) ?? [],
      fundingRounds:
        fundingRounds.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
        })) ?? [],
      investors:
        investors.map(investor => ({
          id: investor.id,
          name: investor.name,
        })) ?? [],
      jobs: jobs.map(jobpost => ({
        ...jobpost,
        salary: nonZeroOrNull(jobpost?.salary),
        minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
        maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
        seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
        culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
        salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
        paysInCrypto: jobpost?.paysInCrypto ?? null,
        offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
        commitment: notStringOrNull(jobpost?.commitment),
        firstSeenTimestamp: nonZeroOrNull(jobpost?.firstSeenTimestamp),
        lastSeenTimestamp: nonZeroOrNull(jobpost?.lastSeenTimestamp),
        publishedTimestamp: nonZeroOrNull(jobpost?.publishedTimestamp),

        url: notStringOrNull(jobpost?.url),
        title: notStringOrNull(jobpost?.title),
      })),
      tags: tags ?? [],
    });
  }
}
