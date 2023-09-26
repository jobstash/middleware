import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { Organization, OrganizationProperties } from "./organization.interface";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { Tag } from "./tag.interface";

@ApiExtraModels(StructuredJobpostWithRelations, OrganizationProperties)
export class AllJobsListResult extends StructuredJobpostWithRelations {
  public static readonly AllJobsListResultType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      organization: Organization.OrganizationPropertiesType,
      technologies: t.array(Tag.TagType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(OrganizationProperties) },
  })
  organization: OrganizationProperties;

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Tag) },
  })
  technologies: Tag[];

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
