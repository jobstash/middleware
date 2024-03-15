import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { OrganizationWithRelations } from "./organization.interface";
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
  OrganizationWithRelations,
)
export class JobListResult extends StructuredJobpostWithRelations {
  public static readonly JobListResultType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      organization: t.intersection([
        OrganizationWithRelations.OrganizationWithRelationsType,
        t.strict({
          hasUser: t.boolean,
        }),
      ]),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(OrganizationWithRelations) },
  })
  organization: OrganizationWithRelations & { hasUser: boolean };

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
