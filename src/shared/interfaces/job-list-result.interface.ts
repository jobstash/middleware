import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
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
  FundingRound,
  Investor,
)
export class JobListResult {
  @ApiProperty()
  organization?: Organization | null;
  @ApiPropertyOptional()
  project?: Project | null;
  @ApiProperty()
  jobpost?: StructuredJobpost | null;
  @ApiProperty()
  fundingRounds: FundingRound[] | null;
  @ApiProperty()
  investors: Investor[] | null;
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
