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
      minSalaryRange: jobpost.minSalaryRange ?? 0,
      maxSalaryRange: jobpost.maxSalaryRange ?? 0,
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
      organization: {
        ...organization,
        projects:
          organization?.projects?.map(project => ({
            ...project,
            tokenSymbol: notStringOrNull(project.tokenSymbol, ["-"]),
            categories: project.categories ?? [],
            hacks: project.hacks ?? [],
            audits: project.audits ?? [],
            chains: project.chains ?? [],
          })) ?? [],
        fundingRounds:
          organization.fundingRounds.map(fr => ({
            ...fr,
            investors: fr.investors ?? [],
          })) ?? [],
      },
      technologies:
        technologies?.map(technology => technology.properties) ?? [],
    } as JobListResult;
  }
}
