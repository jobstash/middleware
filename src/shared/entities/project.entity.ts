import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { ProjectWithRelations } from "../interfaces";
import { Node } from "neo4j-driver";
import { uniqBy } from "lodash";

export class ProjectWithRelationsEntity {
  constructor(private readonly raw: ProjectWithRelations) {}

  getProperties(): ProjectWithRelations {
    const project = this.raw;
    return new ProjectWithRelations({
      ...project,
      orgIds: project?.orgIds ?? [],
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
      isMainnet: project?.isMainnet ?? null,
      logo: notStringOrNull(project?.logo) ?? notStringOrNull(project?.website),
      website: notStringOrNull(project?.website),
      github: notStringOrNull(project?.github),
      twitter: notStringOrNull(project?.twitter),
      telegram: notStringOrNull(project?.telegram),
      discord: notStringOrNull(project?.discord),
      docs: notStringOrNull(project?.docs),
      category: notStringOrNull(project?.category),
      hacks:
        project?.hacks.map(hack => ({
          ...hack,
          fundsLost: hack.fundsLost,
          date: nonZeroOrNull(hack.date),
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
      chains:
        project.chains.map(chain => ({
          ...chain,
          logo: notStringOrNull(chain?.logo),
        })) ?? [],
      investors: Array.from(
        uniqBy(
          project?.investors?.map(investor => ({
            id: investor.id,
            name: investor.name,
            normalizedName: investor.normalizedName,
          })) ?? [],
          "id",
        ),
      ),
      jobs: project?.jobs ?? [],
      repos: project?.repos ?? [],
      description: notStringOrNull(project?.description),
      normalizedName: notStringOrNull(project?.normalizedName),
    });
  }
}

export class ProjectEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getDefiLlamaId(): string | undefined {
    return (<Record<string, string>>this.node.properties).defiLlamaId;
  }

  getDefiLlamaSlug(): string | undefined {
    return (<Record<string, string>>this.node.properties).defiLlamaSlug;
  }

  getDefiLlamaParent(): string | undefined {
    return (<Record<string, string>>this.node.properties).defiLlamaParent;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getDescription(): string {
    return (<Record<string, string>>this.node.properties).description;
  }

  getAltName(): string | undefined {
    return (<Record<string, string>>this.node.properties).altName;
  }

  getIsMainnet(): boolean {
    return (<Record<string, boolean>>this.node.properties).isMainnet;
  }

  getTokenAddress(): string | undefined {
    return (<Record<string, string>>this.node.properties).tokenAddress;
  }

  getTokenSymbol(): string | undefined {
    return (<Record<string, string>>this.node.properties).tokenSymbol;
  }

  getTvl(): number | undefined {
    return (<Record<string, number>>this.node.properties).tvl;
  }

  getMonthlyVolume(): number | undefined {
    return (<Record<string, number>>this.node.properties).monthlyVolume;
  }

  getMonthlyFees(): number | undefined {
    return (<Record<string, number>>this.node.properties).monthlyFees;
  }

  getMonthlyActiveUsers(): number | undefined {
    return (<Record<string, number>>this.node.properties).monthlyActiveUsers;
  }

  getMonthlyRevenue(): number | undefined {
    return (<Record<string, number>>this.node.properties).monthlyRevenue;
  }

  getCreatedTimestamp(): number {
    return (<Record<string, number>>this.node.properties).createdTimestamp;
  }

  getUpdatedTimestamp(): number | undefined {
    return (<Record<string, number>>this.node.properties).updatedTimestamp;
  }

  getProperties(): ProjectWithRelations {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;
    return properties as ProjectWithRelations;
  }
}
