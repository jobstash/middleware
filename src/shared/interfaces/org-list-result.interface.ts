import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { OrganizationWithRelations } from "./organization.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Tag } from "./tag.interface";
import { report } from "io-ts-human-reporter";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";

@ApiExtraModels(OrganizationWithRelations, OrgListResult)
export class OrgListResult extends OrganizationWithRelations {
  public static readonly OrgListResultType = t.intersection([
    OrganizationWithRelations.OrganizationWithRelationsType,
    t.strict({
      jobs: t.array(
        StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
      ),
      tags: t.array(Tag.TagType),
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
  tags: Tag[];

  constructor(raw: OrgListResult) {
    const { jobs, tags, ...orgProperties } = raw;
    super(orgProperties);
    const result = OrgListResult.OrgListResultType.decode(raw);

    this.jobs = jobs;
    this.tags = tags;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org list result instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}
