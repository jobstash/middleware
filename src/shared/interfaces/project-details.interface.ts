import { ApiExtraModels, ApiPropertyOptional } from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Project } from "./project.interface";
import { report } from "io-ts-human-reporter";
import { Technology } from "./technology.interface";
import { ProjectMoreInfo } from "./project-more-info.interface";

@ApiExtraModels(Project, ProjectDetails)
export class ProjectDetails extends ProjectMoreInfo {
  public static readonly ProjectDetailsType = t.intersection([
    ProjectMoreInfo.ProjectMoreInfoType,
    t.strict({
      organization: t.intersection([
        Organization.OrganizationType,
        t.strict({ technologies: t.array(Technology.TechnologyType) }),
      ]),
    }),
  ]);

  @ApiPropertyOptional()
  organization: Organization & { technologies: Technology[] };

  constructor(raw: ProjectDetails) {
    const { organization, ...projectProps } = raw;

    super(projectProps);

    const result = ProjectDetails.ProjectDetailsType.decode(raw);

    this.organization = organization;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
