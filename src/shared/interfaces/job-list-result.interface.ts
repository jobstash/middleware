import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { FundingRoundProperties } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { Organization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";

@ApiExtraModels(
  StructuredJobpost,
  Technology,
  ProjectCategory,
  FundingRoundProperties,
  Investor,
  Organization,
)
export class JobListResult extends StructuredJobpost {
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Organization) },
  })
  organization?: Organization | null;

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies?: Technology[] | null;
}
