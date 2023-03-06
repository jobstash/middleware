import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { Project } from "./project.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";

@ApiExtraModels(
  Organization,
  Project,
  StructuredJobpost,
  Technology,
  ProjectCategory,
)
export class JobListResult {
  @ApiProperty()
  organization?: Organization | null;
  @ApiPropertyOptional()
  project?: Project | null;
  @ApiProperty()
  jobpost?: StructuredJobpost | null;
  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies?: Technology[] | null;
  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(ProjectCategory) },
  })
  categories?: ProjectCategory[] | null;
}
