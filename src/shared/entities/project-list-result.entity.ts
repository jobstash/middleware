import { ProjectCompetitorListResult, ProjectListResult } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { isAfter, isBefore } from "date-fns";

export class ProjectListResultEntity {
  constructor(private readonly raw: ProjectListResult) {}

  getProperties(): ProjectListResult {
    const { ...project } = this.raw;

    return new ProjectListResult({
      ...project,
      orgIds: project?.orgIds ?? [],
      tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
      tvl: nonZeroOrNull(project?.tvl),
      monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
      monthlyFees: nonZeroOrNull(project?.monthlyFees),
      monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
      monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
      logo: notStringOrNull(project?.logo) ?? notStringOrNull(project?.website),
      website: notStringOrNull(project?.website),
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
      ecosystems: project.ecosystems ?? [],
      jobs:
        project?.jobs.map(jobpost => {
          const now = new Date().getTime();

          const isStillFeatured =
            jobpost?.featured === true &&
            isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
            isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

          return {
            ...jobpost,
            salary: nonZeroOrNull(jobpost?.salary),
            minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
            maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
            seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
            culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
            salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
            paysInCrypto: jobpost?.paysInCrypto ?? null,
            offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
            url:
              jobpost?.access === "protected"
                ? null
                : notStringOrNull(jobpost?.url),
            title: notStringOrNull(jobpost?.title),
            summary: notStringOrNull(jobpost?.summary),
            description: notStringOrNull(jobpost?.description),
            commitment: notStringOrNull(jobpost?.commitment),
            timestamp: nonZeroOrNull(jobpost?.timestamp),
            featureStartDate: isStillFeatured
              ? nonZeroOrNull(jobpost?.featureStartDate)
              : null,
            featureEndDate: isStillFeatured
              ? nonZeroOrNull(jobpost?.featureEndDate)
              : null,
            featured: isStillFeatured,
            onboardIntoWeb3: jobpost?.onboardIntoWeb3 ?? false,
            ethSeasonOfInternships: jobpost?.ethSeasonOfInternships ?? false,
            tags:
              jobpost?.tags.map(tag => ({
                ...tag,
                createdTimestamp: nonZeroOrNull(tag?.createdTimestamp),
              })) ?? [],
          };
        }) ?? [],
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
      website: notStringOrNull(project?.website),
      description: notStringOrNull(project?.description),
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
        project?.jobs?.map(jobpost => ({
          ...jobpost,
          salary: nonZeroOrNull(jobpost?.salary),
          minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
          maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
          seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
          culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
          salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
          paysInCrypto: jobpost?.paysInCrypto ?? null,
          onboardIntoWeb3: jobpost?.onboardIntoWeb3 ?? false,
          ethSeasonOfInternships: jobpost?.ethSeasonOfInternships ?? false,
          offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
          url:
            jobpost?.access === "protected"
              ? null
              : notStringOrNull(jobpost?.url),
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
