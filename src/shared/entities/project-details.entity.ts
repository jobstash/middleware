import { OrganizationWithRelations, Tag } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { ProjectDetails } from "../interfaces/project-details.interface";

type RawProject = ProjectDetails & {
  organization?: (OrganizationWithRelations & { tags: Tag[] }) | null;
};

export class ProjectDetailsEntity {
  constructor(private readonly raw: RawProject) {}

  getProperties(): ProjectDetails {
    const { organization, ...project } = this.raw;

    return new ProjectDetails({
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
      github: notStringOrNull(project?.github),
      isMainnet: project?.isMainnet ?? null,
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
      organization: {
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
        fundingRounds:
          organization?.fundingRounds.map(fr => ({
            ...fr,
            raisedAmount: nonZeroOrNull(fr?.raisedAmount),
            roundName: notStringOrNull(fr?.roundName),
            sourceLink: notStringOrNull(fr?.sourceLink),
            createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
          })) ?? [],
        investors:
          organization?.investors.map(investor => ({
            id: investor.id,
            name: investor.name,
          })) ?? [],
        tags: organization?.tags ?? [],
        projects: [],
      },
    });
  }
}
