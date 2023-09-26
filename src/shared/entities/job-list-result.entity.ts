import {
  JobListResult,
  Organization,
  StructuredJobpostWithRelations,
  Tag,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";

type RawJobPost = StructuredJobpostWithRelations & {
  organization?: Organization | null;
  technologies?: Tag[] | null;
};

export class JobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobListResult {
    const jobpost = this.raw;
    const { organization, technologies } = jobpost;

    return new JobListResult({
      ...jobpost,
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      salary: nonZeroOrNull(jobpost?.salary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      url: notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      organization: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        logo: notStringOrNull(organization?.logo),
        altName: notStringOrNull(organization?.altName),
        headCount: nonZeroOrNull(organization?.headCount),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        jobsiteLink: notStringOrNull(organization?.jobsiteLink),
        createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
        projects:
          organization.projects.map(project => ({
            ...project,
            defiLlamaId: notStringOrNull(project?.defiLlamaId),
            cmcId: notStringOrNull(project?.cmcId),
            defiLlamaSlug: notStringOrNull(project?.defiLlamaSlug),
            defiLlamaParent: notStringOrNull(project?.defiLlamaParent),
            tokenAddress: notStringOrNull(project?.tokenAddress),
            tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
            isInConstruction: project?.isInConstruction ?? null,
            tvl: nonZeroOrNull(project?.tvl),
            monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
            monthlyFees: nonZeroOrNull(project?.monthlyFees),
            monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
            telegram: notStringOrNull(project?.telegram),
            logo: notStringOrNull(project?.logo),
            twitter: notStringOrNull(project?.twitter),
            discord: notStringOrNull(project?.discord),
            docs: notStringOrNull(project?.docs),
            teamSize: nonZeroOrNull(project?.teamSize),
            category: notStringOrNull(project?.category),
            githubOrganization: notStringOrNull(project?.githubOrganization),
            updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
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
              roundName: notStringOrNull(fr?.roundName),
              sourceLink: notStringOrNull(fr?.sourceLink),
            }))
            .sort((a, b) => b.date - a.date) ?? [],
        investors: organization?.investors ?? [],
      },
      technologies: technologies ?? [],
    });
  }
}
