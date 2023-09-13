import { Organization, OrganizationProperties } from "./organization.interface";
import { StructuredJobpostWithCategory } from "./structured-jobpost-with-category.interface";
import * as t from "io-ts";
import { Technology } from "./technology.interface";
import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(StructuredJobpostWithCategory, OrganizationProperties)
export class AllJobsListResult extends StructuredJobpostWithCategory {
  public static readonly AllJobsListResultType = t.intersection([
    StructuredJobpostWithCategory.StructuredJobpostWithCategoryType,
    t.strict({
      organization: Organization.OrganizationPropertiesType,
      technologies: t.array(Technology.TechnologyType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(OrganizationProperties) },
  })
  organization: OrganizationProperties;

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies: Technology[];

  constructor(raw: AllJobsListResult) {
    const { organization, technologies, ...jobpostProperties } = raw;
    super(jobpostProperties);
    const result = AllJobsListResult.AllJobsListResultType.decode(raw);

    this.organization = organization;
    this.technologies = technologies;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `all jobs list instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
