import { ApiExtraModels, ApiPropertyOptional } from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Project } from "./project.interface";
import { report } from "io-ts-human-reporter";
import { Technology } from "./technology.interface";

@ApiExtraModels(Project, ProjectListResult)
export class ProjectListResult extends Project {
  public static readonly ProjectListResultType = t.intersection([
    Project.ProjectType,
    t.strict({
      organization: t.intersection([
        Organization.OrganizationType,
        t.strict({ technologies: t.array(Technology.TechnologyType) }),
      ]),
    }),
  ]);

  @ApiPropertyOptional()
  organization: Organization & { technologies: Technology[] };

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
