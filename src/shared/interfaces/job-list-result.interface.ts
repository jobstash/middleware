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
import { Tag } from "./tag.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";

@ApiExtraModels(
  StructuredJobpost,
  Tag,
  ProjectCategory,
  FundingRound,
  Investor,
  Organization,
)
export class JobListResult extends StructuredJobpostWithRelations {
  public static readonly JobListResultType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      organization: Organization.OrganizationType,
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Organization) },
  })
  organization: Organization;

  constructor(raw: JobListResult) {
    const { organization, ...jobpostProperties } = raw;
    super(jobpostProperties);
    const result = JobListResult.JobListResultType.decode(raw);

    this.organization = organization;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `job list result instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
