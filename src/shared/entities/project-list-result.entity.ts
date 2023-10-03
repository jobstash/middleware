import { ProjectListResult } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";

export class ProjectListResultEntity {
  constructor(private readonly raw: ProjectListResult) {}

  getProperties(): ProjectListResult {
    const { ...project } = this.raw;

    return new ProjectListResult({
      ...project,
      tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
      tvl: nonZeroOrNull(project?.tvl),
      monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
      monthlyFees: nonZeroOrNull(project?.monthlyFees),
      monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
      monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
      logo: notStringOrNull(project?.logo),
      teamSize: nonZeroOrNull(project?.teamSize),
      isMainnet: project?.isMainnet ?? null,
      website: notStringOrNull(project?.website),
      category: notStringOrNull(project?.category),
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
    });
  }
}
