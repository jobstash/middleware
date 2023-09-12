import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, ProjectCategory, NoRelations } from "../types";

export type ProjectCategoryProps = ExtractProps<ProjectCategory>;

export type ProjectCategoryInstance = NeogmaInstance<
  ProjectCategoryProps,
  NoRelations
>;

export const ProjectCategories = (
  neogma: Neogma,
): NeogmaModel<ProjectCategoryProps, NoRelations> =>
  ModelFactory<ProjectCategoryProps, NoRelations>(
    {
      label: "ProjectCategory",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
