import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostCategory, NoRelations } from "../types";

export type JobpostCategoryProps = ExtractProps<JobpostCategory>;

export type JobpostCategoryInstance = NeogmaInstance<
  JobpostCategoryProps,
  NoRelations
>;

export const JobpostCategories = (
  neogma: Neogma,
): NeogmaModel<JobpostCategoryProps, NoRelations> =>
  ModelFactory<JobpostCategoryProps, NoRelations>(
    {
      label: "JobpostCategory",
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
          enum: ["technical", "not-technical"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
