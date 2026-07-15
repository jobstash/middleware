import { nonZeroOrNull, notStringOrNull } from "../helpers";
import {
  GraphNode,
  ProjectWithBaseRelations,
  ProjectWithRelations,
} from "../interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";

export class ProjectWithBaseRelationsEntity {
  private readonly logger = new CustomLogger(
    ProjectWithBaseRelationsEntity.name,
  );

  constructor(private readonly raw: ProjectWithBaseRelations) {}

  getProperties(): ProjectWithBaseRelations {
    const project = this.raw;
    this.logger.debug(
      `Getting properties for project: ${project?.name} (${project?.id})`,
    );
    return new ProjectWithBaseRelations({
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
          issueType: notStringOrNull(hack?.issueType),
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
      jobs:
        project?.jobs.map(job => ({
          ...job,
          tags:
            job.tags.map(tag => ({
              ...tag,
              createdTimestamp: nonZeroOrNull(tag?.createdTimestamp),
            })) ?? [],
        })) ?? [],
      repos: project?.repos ?? [],
      grants:
        project?.grants?.map(grant => ({
          ...grant,
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      fundingRounds:
        project?.fundingRounds?.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
        })) ?? [],
      description: notStringOrNull(project?.description),
      normalizedName: notStringOrNull(project?.normalizedName),
    });
  }
}

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
          issueType: notStringOrNull(hack?.issueType),
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
      jobs:
        project?.jobs.map(job => ({
          ...job,
          tags:
            job.tags.map(tag => ({
              ...tag,
              createdTimestamp: nonZeroOrNull(tag?.createdTimestamp),
            })) ?? [],
        })) ?? [],
      repos: project?.repos ?? [],
      grants:
        project?.grants?.map(grant => ({
          ...grant,
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      fundingRounds:
        project?.fundingRounds?.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
        })) ?? [],
      description: notStringOrNull(project?.description),
      normalizedName: notStringOrNull(project?.normalizedName),
    });
  }
}

export class ProjectEntity {
  private readonly properties: Record<string, unknown>;

  constructor(node: GraphNode | Record<string, unknown>) {
    this.properties =
      "properties" in node
        ? (node.properties as Record<string, unknown>)
        : node;
  }

  getId(): string {
    return this.properties.id as string;
  }

  getDefiLlamaId(): string | undefined {
    return this.properties.defiLlamaId as string | undefined;
  }

  getDefiLlamaSlug(): string | undefined {
    return this.properties.defiLlamaSlug as string | undefined;
  }

  getDefiLlamaParent(): string | undefined {
    return this.properties.defiLlamaParent as string | undefined;
  }

  getName(): string {
    return this.properties.name as string;
  }

  getDescription(): string {
    return this.properties.description as string;
  }

  getAltName(): string | undefined {
    return this.properties.altName as string | undefined;
  }

  getTokenAddress(): string | undefined {
    return this.properties.tokenAddress as string | undefined;
  }

  getTokenSymbol(): string | undefined {
    return this.properties.tokenSymbol as string | undefined;
  }

  getTvl(): number | undefined {
    return this.properties.tvl as number | undefined;
  }

  getMonthlyVolume(): number | undefined {
    return this.properties.monthlyVolume as number | undefined;
  }

  getMonthlyFees(): number | undefined {
    return this.properties.monthlyFees as number | undefined;
  }

  getMonthlyActiveUsers(): number | undefined {
    return this.properties.monthlyActiveUsers as number | undefined;
  }

  getMonthlyRevenue(): number | undefined {
    return this.properties.monthlyRevenue as number | undefined;
  }

  getCreatedTimestamp(): number {
    return this.properties.createdTimestamp as number;
  }

  getUpdatedTimestamp(): number | undefined {
    return this.properties.updatedTimestamp as number | undefined;
  }

  getProperties(): ProjectWithRelations {
    const { ...properties } = this.properties;
    return properties as unknown as ProjectWithRelations;
  }
}
