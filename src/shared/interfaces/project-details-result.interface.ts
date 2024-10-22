import { ApiExtraModels, ApiPropertyOptional } from "@nestjs/swagger";
import { OrganizationWithRelations } from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Tag } from "./tag.interface";
import { ProjectWithRelations } from "./project-with-relations.interface";

@ApiExtraModels(ProjectWithRelations, ProjectDetailsResult)
export class ProjectDetailsResult extends ProjectWithRelations {
  public static readonly ProjectDetailsType = t.intersection([
    ProjectWithRelations.ProjectWithRelationsType,
    t.strict({
      organizations: t.array(
        t.union([
          t.intersection([
            OrganizationWithRelations.OrganizationWithRelationsType,
            t.strict({ tags: t.array(Tag.TagType) }),
          ]),
          t.null,
        ]),
      ),
    }),
  ]);

  @ApiPropertyOptional()
  organizations: (OrganizationWithRelations & { tags: Tag[] })[];

  constructor(raw: ProjectDetailsResult) {
    const { organizations, ...projectProps } = raw;

    super(projectProps);

    const result = ProjectDetailsResult.ProjectDetailsType.decode(raw);

    this.organizations = organizations;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project details instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
