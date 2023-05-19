import {
  JobListResult,
  Organization,
  StructuredJobpost,
  Technology,
} from "src/shared/types";
import { notStringOrNull } from "../helpers";

type RawJobPost = StructuredJobpost & {
  organization?: Organization | null;
  technologies?: [object & { properties: Technology }] | null;
};

export class JobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobListResult {
    const jobpost = this.raw;
    const { organization, technologies } = jobpost;

    return {
      ...jobpost,
      minSalaryRange: jobpost.minSalaryRange ?? null,
      maxSalaryRange: jobpost.maxSalaryRange ?? null,
      medianSalary: jobpost.medianSalary ?? null,
      seniority: notStringOrNull(jobpost.seniority, ["", "undefined"]),
      jobLocation: notStringOrNull(jobpost.jobLocation, [
        "",
        "undefined",
        "unspecified",
      ]),
      jobCommitment: notStringOrNull(jobpost.jobCommitment, ["", "undefined"]),
      role: notStringOrNull(jobpost.role, ["", "undefined"]),
      team: notStringOrNull(jobpost.team, ["", "undefined"]),
      benefits: notStringOrNull(jobpost.benefits, ["", "undefined"]),
      culture: notStringOrNull(jobpost.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost.salaryCurrency),
      paysInCrypto: jobpost.paysInCrypto ?? null,
      offersTokenAllocation: jobpost.offersTokenAllocation ?? null,
      jobPageUrl: notStringOrNull(jobpost.jobPageUrl),
      jobTitle: notStringOrNull(jobpost.jobTitle),
      aiDetectedTechnologies: notStringOrNull(jobpost.aiDetectedTechnologies),
      organization: {
        ...organization,
        docs: notStringOrNull(organization.docs),
        altName: notStringOrNull(organization.altName),
        headCount: organization.headCount ?? null,
        teamSize: organization.teamSize ?? null,
        github: notStringOrNull(organization.github),
        twitter: notStringOrNull(organization.twitter),
        discord: notStringOrNull(organization.discord),
        linkedin: notStringOrNull(organization.linkedin),
        telegram: notStringOrNull(organization.telegram),
        updatedTimestamp: organization.updatedTimestamp ?? null,
        projects:
          organization?.projects?.map(project => ({
            ...project,
            defiLlamaId: notStringOrNull(project.defiLlamaId),
            defiLlamaSlug: notStringOrNull(project.defiLlamaSlug),
            defiLlamaParent: notStringOrNull(project.defiLlamaParent),
            tokenAddress: notStringOrNull(project.tokenAddress),
            tokenSymbol: notStringOrNull(project.tokenSymbol, ["-"]),
            isInConstruction: project.isInConstruction ?? null,
            tvl: project.tvl ?? null,
            monthlyVolume: project.monthlyVolume ?? null,
            monthlyFees: project.monthlyFees ?? null,
            monthlyRevenue: project.monthlyRevenue ?? null,
            telegram: notStringOrNull(project.telegram),
            twitter: notStringOrNull(project.twitter),
            discord: notStringOrNull(project.discord),
            docs: notStringOrNull(project.docs),
            teamSize: project.teamSize ?? null,
            githubOrganization: notStringOrNull(project.githubOrganization),
            updatedTimestamp: project.updatedTimestamp ?? null,
            categories: project.categories ?? [],
            hacks: project.hacks ?? [],
            audits:
              project.audits.map(audit => ({
                ...audit,
                auditor: notStringOrNull(audit.auditor),
              })) ?? [],
            chains: project.chains ?? [],
          })) ?? [],
        fundingRounds:
          organization.fundingRounds.map(fr => ({
            ...fr,
            roundName: notStringOrNull(fr.roundName),
            sourceLink: notStringOrNull(fr.sourceLink),
            investors: fr.investors ?? [],
          })) ?? [],
      },
      technologies:
        technologies?.map(technology => technology.properties) ?? [],
    } as JobListResult;
  }
}
