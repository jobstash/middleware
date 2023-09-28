import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import {
  OrganizationWithRelations,
  Organization,
} from "./organization.interface";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";

@ApiExtraModels(StructuredJobpostWithRelations, Organization)
export class AllJobsListResult extends StructuredJobpostWithRelations {
  public static readonly AllJobsListResultType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      organization: OrganizationWithRelations.OrganizationWithRelationsType,
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Organization) },
  })
  organization: OrganizationWithRelations;

  constructor(raw: AllJobsListResult) {
    const { organization, ...jobpostProperties } = raw;
    super(jobpostProperties);
    const result = AllJobsListResult.AllJobsListResultType.decode(raw);

    this.organization = organization;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `all jobs list instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
