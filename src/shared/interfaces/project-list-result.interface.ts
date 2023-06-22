import { ApiExtraModels, ApiPropertyOptional } from "@nestjs/swagger";
import { Organization, OrganizationProperties } from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Project } from "./project.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(Project, ProjectListResult)
export class ProjectListResult extends Project {
  public static readonly ProjectListResultType = t.intersection([
    Project.ProjectType,
    t.strict({
      organization: Organization.OrganizationPropertiesType,
    }),
  ]);

  @ApiPropertyOptional()
  organization: OrganizationProperties;

  constructor(raw: ProjectListResult) {
    const { organization, ...projectProps } = raw;

    super(projectProps);

    const result = ProjectListResult.ProjectListResultType.decode(raw);

    this.organization = organization;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
