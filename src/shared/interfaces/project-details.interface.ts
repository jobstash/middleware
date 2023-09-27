import { ApiExtraModels, ApiPropertyOptional } from "@nestjs/swagger";
import { Organization } from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Project } from "./project.interface";
import { report } from "io-ts-human-reporter";
import { Tag } from "./tag.interface";
import { ProjectMoreInfo } from "./project-more-info.interface";

@ApiExtraModels(Project, ProjectDetails)
export class ProjectDetails extends ProjectMoreInfo {
  public static readonly ProjectDetailsType = t.intersection([
    ProjectMoreInfo.ProjectMoreInfoType,
    t.strict({
      organization: t.intersection([
        Organization.OrganizationType,
        t.strict({ tags: t.array(Tag.TagType) }),
      ]),
    }),
  ]);

  @ApiPropertyOptional()
  organization: Organization & { tags: Tag[] };

  constructor(raw: ProjectDetails) {
    const { organization, ...projectProps } = raw;

    super(projectProps);

    const result = ProjectDetails.ProjectDetailsType.decode(raw);

    this.organization = organization;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project details instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
