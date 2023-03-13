import {
  JobListResult,
  Organization,
  Project,
  ProjectCategory,
  StructuredJobpost,
  Technology,
} from "src/shared/types";
import { notStringOrNull } from "../helpers";
import { FundingRound } from "../interfaces/funding-round.interface";
import { Investor } from "../interfaces/investor.interface";

type RawJobPost = {
  organization?: Organization | null;
  project?: Project | null;
  jobpost?: StructuredJobpost | null;
  fundingRounds?: [object & { properties: FundingRound }] | null;
  investors?: [object & { properties: Investor }] | null;
  technologies?: [object & { properties: Technology }] | null;
  categories?: [object & { properties: ProjectCategory }] | null;
};

export class JobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobListResult {
    // eslint-disable-next-line
    const {
      organization,
      project,
      jobpost,
      fundingRounds,
      investors,
      technologies,
      categories,
    } = this.raw;

    return {
      organization: {
        ...organization,
        teamSize: notStringOrNull(organization.teamSize, ["", "undefined"]),
      },
      project:
        project !== null
          ? {
              ...project,
              tokenSymbol: notStringOrNull(project.tokenSymbol, ["-"]),
              hacks: project.hacks?.map(h => h["properties"]) ?? project.hacks,
              chains:
                project.chains?.map(c => c["properties"]) ?? project.chains,
              audits:
                project.audits?.map(a => a["properties"]) ?? project.audits,
            }
          : project,
      jobpost: {
        ...jobpost,
        seniority: notStringOrNull(jobpost.seniority, ["", "undefined"]),
        jobLocation: notStringOrNull(jobpost.jobLocation, [
          "",
          "undefined",
          "unspecified",
        ]),
        jobCommitment: notStringOrNull(jobpost.jobCommitment, [
          "",
          "undefined",
        ]),
        role: notStringOrNull(jobpost.role, ["", "undefined"]),
        team: notStringOrNull(jobpost.team, ["", "undefined"]),
        benefits: notStringOrNull(jobpost.benefits, ["", "undefined"]),
        culture: notStringOrNull(jobpost.culture, ["", "undefined"]),
      },
      fundingRounds: fundingRounds?.map(round => round.properties),
      investors: investors?.map(investor => investor.properties),
      technologies: technologies?.map(technology => technology.properties),
      categories: categories?.map(category => category.properties),
    } as JobListResult;
  }
}
