import {
  JobDetailsResult,
  Organization,
  Project,
  StructuredJobpost,
} from "src/shared/types";

type RawJobPost = {
  organization?: Organization | null;
  project?: Project | null;
  jobpost?: StructuredJobpost | null;
};

export class JobDetailsResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobDetailsResult {
    // eslint-disable-next-line
    const { organization, project, jobpost } = this.raw;

    const parsedOrgName = organization.name
      .split(" ")
      .map(part => part.toLowerCase())
      .join("_");
    const parsedProjectName = project.name
      .split(" ")
      .map(part => part.toLowerCase())
      .join("_");

    return {
      organization: parsedOrgName,
      project: `${parsedOrgName}-${parsedProjectName}`,
      repository: null,
      jobpost: jobpost,
    } as JobDetailsResult;
  }
}
