import {
  JobListResult,
  Organization,
  Project,
  ProjectCategory,
  StructuredJobpost,
  Technology,
} from "src/shared/types";

type RawJobPost = {
  organization?: Organization | null;
  project?: Project | null;
  jobpost?: StructuredJobpost | null;
  technologies?: [object & { properties: Technology }] | null;
  categories?: [object & { properties: ProjectCategory }] | null;
};

export class JobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobListResult {
    // eslint-disable-next-line
    const { organization, project, jobpost, technologies, categories } =
      this.raw;

    return {
      organization: organization,
      project:
        project !== null
          ? {
              ...project,
              hacks: project.hacks?.map(h => h["properties"]) ?? project.hacks,
              chains:
                project.chains?.map(c => c["properties"]) ?? project.chains,
              audits:
                project.audits?.map(a => a["properties"]) ?? project.audits,
            }
          : project,
      jobpost: jobpost,
      technologies: technologies?.map(technology => technology.properties),
      categories: categories?.map(category => category.properties),
    } as JobListResult;
  }
}
