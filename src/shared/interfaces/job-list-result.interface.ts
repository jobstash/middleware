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
import * as t from "io-ts";
import { inferObjectType } from "../helpers";
import { isLeft } from "fp-ts/lib/Either";

@ApiExtraModels(
  StructuredJobpost,
  Technology,
  ProjectCategory,
  FundingRoundProperties,
  Investor,
  Organization,
)
export class JobListResult extends StructuredJobpost {
  public static readonly JobListResultType = t.intersection([
    StructuredJobpost.StructuredJobpostType,
    t.strict({
      organization: Organization.OrganizationType,
      technologies: t.array(Technology.TechnologyType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Organization) },
  })
  organization: Organization;

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies: Technology[];

  constructor(raw: JobListResult) {
    const { organization, technologies, ...jobpostProperties } = raw;
    super(jobpostProperties);
    const result = JobListResult.JobListResultType.decode(raw);

    this.organization = organization;
    this.technologies = technologies;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing JobListResult! Constructor expected: \n {
          ...StructuredJobpost,
          organization: Organization,
          technologies: Technology[],
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}
