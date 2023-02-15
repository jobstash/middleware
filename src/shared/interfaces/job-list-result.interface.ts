import { ApiResponseProperty } from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { Project } from "./project.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";

export class JobListResult {
  @ApiResponseProperty()
  organization?: Organization | null;
  @ApiResponseProperty()
  project?: Project | null;
  @ApiResponseProperty()
  jobpost?: StructuredJobpost | null;
  @ApiResponseProperty()
  technologies?: Technology[] | null;
  @ApiResponseProperty()
  categories?: ProjectCategory[] | null;
}
