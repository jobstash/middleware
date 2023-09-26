import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Tag } from "./tag.interface";
import { report } from "io-ts-human-reporter";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";

@ApiExtraModels(Organization, OrgListResult)
export class OrgListResult extends Organization {
  public static readonly OrgListResultType = t.intersection([
    Organization.OrganizationType,
    t.strict({
      jobs: t.array(
        StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
      ),
      technologies: t.array(Tag.TagType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(StructuredJobpost) },
  })
  jobs: StructuredJobpostWithRelations[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Tag) },
  })
  technologies: Tag[];

  constructor(raw: OrgListResult) {
    const { jobs, technologies, ...orgProperties } = raw;
    super(orgProperties);
    const result = OrgListResult.OrgListResultType.decode(raw);

    this.jobs = jobs;
    this.technologies = technologies;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org list result instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}
