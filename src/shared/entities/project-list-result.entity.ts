import { ProjectCompetitorListResult, ProjectListResult } from "../interfaces";
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
      logo: notStringOrNull(project?.logo) ?? notStringOrNull(project?.website),
      isMainnet: project?.isMainnet ?? null,
      website: notStringOrNull(project?.website),
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
          id: notStringOrNull(chain?.id),
          name: notStringOrNull(chain?.name),
          logo: notStringOrNull(chain?.logo),
        })) ?? [],
      jobs:
        project?.jobs.map(jobpost => ({
          ...jobpost,
          salary: nonZeroOrNull(jobpost?.salary),
          minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
          maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
          seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
          culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
          salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
          paysInCrypto: jobpost?.paysInCrypto ?? null,
          offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
          url: notStringOrNull(jobpost?.url),
          title: notStringOrNull(jobpost?.title),
          summary: notStringOrNull(jobpost?.summary),
          description: notStringOrNull(jobpost?.description),
          commitment: notStringOrNull(jobpost?.commitment),
          timestamp: nonZeroOrNull(jobpost?.timestamp),
        })) ?? [],
      repos:
        project?.repos?.map(repo => ({
          ...repo,
          pushedAt: nonZeroOrNull(repo.pushedAt),
          updatedAt: nonZeroOrNull(repo.updatedAt),
          createdAt: nonZeroOrNull(repo.createdAt),
        })) ?? [],
    });
  }
}

export class ProjectCompetitorListResultEntity {
  constructor(private readonly raw: ProjectCompetitorListResult) {}

  getProperties(): ProjectCompetitorListResult {
    const { ...project } = this.raw;

    return new ProjectCompetitorListResult({
      ...project,
      tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
      tvl: nonZeroOrNull(project?.tvl),
      monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
      monthlyFees: nonZeroOrNull(project?.monthlyFees),
      monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
      monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
      logo: notStringOrNull(project?.logo) ?? notStringOrNull(project?.website),
      isMainnet: project?.isMainnet ?? null,
      website: notStringOrNull(project?.website),
      description: notStringOrNull(project?.description),
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
          id: notStringOrNull(chain?.id),
          name: notStringOrNull(chain?.name),
          logo: notStringOrNull(chain?.logo),
        })) ?? [],
      jobs:
        project?.jobs?.map(jobpost => ({
          ...jobpost,
          salary: nonZeroOrNull(jobpost?.salary),
          minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
          maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
          seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
          culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
          salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
          paysInCrypto: jobpost?.paysInCrypto ?? null,
          offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
          url: notStringOrNull(jobpost?.url),
          title: notStringOrNull(jobpost?.title),
          summary: notStringOrNull(jobpost?.summary),
          description: notStringOrNull(jobpost?.description),
          commitment: notStringOrNull(jobpost?.commitment),
          timestamp: nonZeroOrNull(jobpost?.timestamp),
        })) ?? [],
      repos: project?.repos?.map(repo => ({ ...repo })) ?? [],
    });
  }
}
