import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostStatus, NoRelations } from "../types";

export type JobpostStatusProps = ExtractProps<JobpostStatus>;

export type JobpostStatusInstance = NeogmaInstance<
  JobpostStatusProps,
  NoRelations
>;

export const JobpostStatuses = (
  neogma: Neogma,
): NeogmaModel<JobpostStatusProps, NoRelations> =>
  ModelFactory<JobpostStatusProps, NoRelations>(
    {
      label: "JobpostStatus",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        status: {
          type: "string",
          allowEmpty: false,
          required: true,
          enum: ["active", "offline"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
