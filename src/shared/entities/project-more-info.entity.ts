import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { ProjectMoreInfo } from "../interfaces";

export class ProjectMoreInfoEntity {
  constructor(private readonly raw: ProjectMoreInfo) {}

  getProperties(): ProjectMoreInfo {
    const project = this.raw;
    return new ProjectMoreInfo({
      ...project,
      orgIds: project?.orgIds ?? [],
      summary: notStringOrNull(project?.summary),
      description: notStringOrNull(project?.description),
      tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
      tokenAddress: notStringOrNull(project?.tokenAddress, ["-"]),
      defiLlamaId: notStringOrNull(project?.defiLlamaId, ["-"]),
      defiLlamaSlug: notStringOrNull(project?.defiLlamaSlug, ["-"]),
      defiLlamaParent: notStringOrNull(project?.defiLlamaParent, ["-"]),
      tvl: nonZeroOrNull(project?.tvl),
      monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
      monthlyFees: nonZeroOrNull(project?.monthlyFees),
      monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
      monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
      createdTimestamp: nonZeroOrNull(project?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
      logo: notStringOrNull(project?.logo),
    });
  }
}
