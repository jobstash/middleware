import {
  JobDetailsResult,
  Organization,
  Project,
  StructuredJobpost,
  Technology,
} from "src/shared/types";

type RawJobPost = {
  organization?: Organization | null;
  project?: Project | null;
  jobpost?: StructuredJobpost | null;
  technologies?: [object & { properties: Technology }] | null;
};

export class JobDetailsResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobDetailsResult {
    // eslint-disable-next-line
    const { organization, project, jobpost, technologies } = this.raw;

    const parsedOrgName = organization.name
      .split(" ")
      .map(part => part.toLowerCase())
      .join("_");
    const parsedProjectName = project?.name
      .split(" ")
      .map(part => part.toLowerCase())
      .join("_");

    return {
      organization: parsedOrgName,
      project: project ? `${parsedOrgName}-${parsedProjectName}` : null,
      repository: null,
      jobpost: jobpost,
      technologies: technologies.map(tech => tech.properties),
    } as JobDetailsResult;
  }
}
