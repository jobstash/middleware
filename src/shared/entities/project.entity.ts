import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Project } from "../interfaces";
import { Node } from "neo4j-driver";

export class ProjectMoreInfoEntity {
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

  getUrl(): string {
    return (<Record<string, string>>this.node.properties).url;
  }

  getLogo(): string {
    return (<Record<string, string>>this.node.properties).logo;
  }

  getGithubOrganization(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubOrganization;
  }

  getAltName(): string | undefined {
    return (<Record<string, string>>this.node.properties).altName;
  }

  getTwitter(): string | undefined {
    return (<Record<string, string>>this.node.properties).twitter;
  }

  getDiscord(): string | undefined {
    return (<Record<string, string>>this.node.properties).discord;
  }

  getDocs(): string | undefined {
    return (<Record<string, string>>this.node.properties).docs;
  }

  getTelegram(): string | undefined {
    return (<Record<string, string>>this.node.properties).telegram;
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

  getProperties(): Project {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;
    return properties as Project;
  }
}
