import { Organization, Project, Technology } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { ProjectListResult } from "../interfaces/project-list-result.interface";

type RawProject = Project & {
  organization?: (Organization & { technologies: Technology[] }) | null;
};

export class ProjectListResultEntity {
  constructor(private readonly raw: RawProject) {}

  getProperties(): ProjectListResult {
    const { organization, ...project } = this.raw;

    return new ProjectListResult({
      ...project,
      defiLlamaId: notStringOrNull(project?.defiLlamaId),
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
      githubOrganization: notStringOrNull(project?.githubOrganization),
      updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
      categories: project?.categories ?? [],
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
          auditor: notStringOrNull(audit?.auditor),
        })) ?? [],
      chains: project?.chains ?? [],
      organization: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        altName: notStringOrNull(organization?.altName),
        headCount: nonZeroOrNull(organization?.headCount),
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
          })) ?? [],
        investors: organization?.investors ?? [],
        technologies: organization?.technologies ?? [],
        projects: [],
      },
    });
  }
}
