import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { Organization } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Technology } from "./technology.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(
  StructuredJobpost,
  Technology,
  ProjectCategory,
  FundingRound,
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
      report(result).forEach(x => {
        console.error(x);
      });
    }
  }
}
