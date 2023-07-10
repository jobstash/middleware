import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Project } from "../interfaces";

export class ProjectEntity {
  constructor(private readonly raw: Project) {}

  getProperties(): Project {
    const project = this.raw;
    return new Project({
      ...project,
      category: notStringOrNull(project.category),
      tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
      tvl: nonZeroOrNull(project?.tvl),
      monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
      monthlyFees: nonZeroOrNull(project?.monthlyFees),
      monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
      logo: notStringOrNull(project?.logo),
      teamSize: nonZeroOrNull(project?.teamSize),
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
