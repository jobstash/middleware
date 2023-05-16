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
    // eslint-disable-next-line
    const jobpost = this.raw;
    const { organization, technologies } = jobpost;

    return {
      ...jobpost,
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
        teamSize: notStringOrNull(organization?.teamSize, ["", "undefined"]),
        projects: organization?.projects?.map(project => ({
          ...project,
          tokenSymbol: notStringOrNull(project.tokenSymbol, ["-"]),
        })),
      },
      technologies: technologies?.map(technology => technology.properties),
    } as JobListResult;
  }
}
