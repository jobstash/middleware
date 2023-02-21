import { ApiProperty } from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { Project } from "./project.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";

export class JobListResult {
  @ApiProperty()
  organization?: Organization | null;
  @ApiProperty()
  project?: Project | null;
  @ApiProperty()
  jobpost?: StructuredJobpost | null;
  @ApiProperty()
  technologies?: Technology[] | null;
  @ApiProperty()
  categories?: ProjectCategory[] | null;
}
