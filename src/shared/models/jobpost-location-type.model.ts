import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostLocationType, NoRelations } from "../types";

export type JobpostLocationTypeProps = ExtractProps<JobpostLocationType>;

export type JobpostLocationTypeInstance = NeogmaInstance<
  JobpostLocationTypeProps,
  NoRelations
>;

export const JobpostLocationTypes = (
  neogma: Neogma,
): NeogmaModel<JobpostLocationTypeProps, NoRelations> =>
  ModelFactory<JobpostLocationTypeProps, NoRelations>(
    {
      label: "JobpostLocationType",
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
          enum: ["REMOTE", "ONSITE", "HYBRID"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
