import { Organization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { Project } from "./project.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";

export interface JobListResult {
  organization?: Organization | null;
  project?: Project | null;
  jobpost?: StructuredJobpost | null;
  technologies?: Technology[] | null;
  categories?: ProjectCategory[] | null;
}
