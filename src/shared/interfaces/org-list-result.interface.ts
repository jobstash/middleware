import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Technology } from "./technology.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(Organization, OrgListResult)
export class OrgListResult extends Organization {
  public static readonly OrgListResultType = t.intersection([
    Organization.OrganizationType,
    t.strict({
      jobs: t.array(StructuredJobpost.StructuredJobpostType),
      technologies: t.array(Technology.TechnologyType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(StructuredJobpost) },
  })
  jobs: StructuredJobpost[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Technology) },
  })
  technologies: Technology[];

  constructor(raw: OrgListResult) {
    const { jobs, technologies, ...orgProperties } = raw;
    super(orgProperties);
    const result = OrgListResult.OrgListResultType.decode(raw);

    this.jobs = jobs;
    this.technologies = technologies;

    if (isLeft(result)) {
      report(result).forEach(x => {
        console.error(x);
      });
    }
  }
}
