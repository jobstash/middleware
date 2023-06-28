import {
  FundingRound,
  Organization,
  StructuredJobpost,
  Technology,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { OrgListResult } from "../interfaces/org-list-result.interface";
import { Project } from "ts-morph";
import { Investor } from "../interfaces/investor.interface";

type RawOrg = Organization & {
  jobs?: (StructuredJobpost & { technologies: Technology[] })[] | null;
  technologies: Technology[];
  projects?: Project[] | null;
  investors?: Investor[] | null;
  fundingRounds?: FundingRound[] | null;
};

export class OrgListResultEntity {
  constructor(private readonly raw: RawOrg) {}

  getProperties(): OrgListResult {
    const organization = this.raw;
    const { jobs, investors, fundingRounds, projects, technologies } =
      organization;

    return new OrgListResult({
      ...organization,
      docs: notStringOrNull(organization?.docs),
      altName: notStringOrNull(organization?.altName),
      headCount: nonZeroOrNull(organization?.headCount),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      projects:
        projects.map(project => ({
          ...project,
          defiLlamaId: notStringOrNull(project?.defiLlamaId),
          defiLlamaSlug: notStringOrNull(project?.defiLlamaSlug),
          defiLlamaParent: notStringOrNull(project?.defiLlamaParent),
          tokenAddress: notStringOrNull(project?.tokenAddress),
          tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
          isInConstruction: project?.isInConstruction ?? null,
          tvl: nonZeroOrNull(project?.tvl),
          monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
          monthlyFees: nonZeroOrNull(project?.monthlyFees),
          monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
          telegram: notStringOrNull(project?.telegram),
          logo: notStringOrNull(project?.logo),
          twitter: notStringOrNull(project?.twitter),
          discord: notStringOrNull(project?.discord),
          docs: notStringOrNull(project?.docs),
          teamSize: nonZeroOrNull(project?.teamSize),
          githubOrganization: notStringOrNull(project?.githubOrganization),
          updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
          categories: project?.categories ?? [],
          hacks: project?.hacks ?? [],
          audits:
            project?.audits.map(audit => ({
              ...audit,
              auditor: notStringOrNull(audit?.auditor),
            })) ?? [],
          chains: project?.chains ?? [],
        })) ?? [],
      fundingRounds:
        fundingRounds.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
        })) ?? [],
      investors: investors ?? [],
      jobs: jobs.map(jobpost => ({
        ...jobpost,
        minSalaryRange: nonZeroOrNull(jobpost?.minSalaryRange),
        maxSalaryRange: nonZeroOrNull(jobpost?.maxSalaryRange),
        medianSalary: nonZeroOrNull(jobpost?.medianSalary),
        seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
        jobLocation: notStringOrNull(jobpost?.jobLocation, [
          "",
          "undefined",
          "unspecified",
        ]),
        jobCommitment: notStringOrNull(jobpost?.jobCommitment, [
          "",
          "undefined",
        ]),
        role: notStringOrNull(jobpost?.role, ["", "undefined"]),
        team: notStringOrNull(jobpost?.team, ["", "undefined"]),
        benefits: notStringOrNull(jobpost?.benefits, ["", "undefined"]),
        culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
        salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
        paysInCrypto: jobpost?.paysInCrypto ?? null,
        offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
        jobPageUrl: notStringOrNull(jobpost?.jobPageUrl),
        jobTitle: notStringOrNull(jobpost?.jobTitle),
        aiDetectedTechnologies: notStringOrNull(
          jobpost?.aiDetectedTechnologies,
        ),
      })),
      technologies: technologies ?? [],
    });
  }
}
