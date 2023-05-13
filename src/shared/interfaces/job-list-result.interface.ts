import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { OldFundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { Organization, OldOrganization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { OldProject } from "./project.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";

@ApiExtraModels(
  OldOrganization,
  OldProject,
  StructuredJobpost,
  Technology,
  ProjectCategory,
  OldFundingRound,
  Investor,
)
export class OldJobListResult {
  @ApiPropertyOptional()
  organization?: OldOrganization | null;
  @ApiPropertyOptional()
  project?: OldProject | null;
  @ApiPropertyOptional()
  jobpost?: StructuredJobpost | null;
  @ApiPropertyOptional()
  fundingRounds: OldFundingRound[] | null;
  @ApiPropertyOptional()
  investors: Investor[] | null;
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies?: Technology[] | null;
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(ProjectCategory) },
  })
  categories?: ProjectCategory[] | null;
}

@ApiExtraModels(Organization)
export class JobListResult extends StructuredJobpost {
  @ApiProperty()
  organization?: Organization | null;

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies?: Technology[] | null;
}
