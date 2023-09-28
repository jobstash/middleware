import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostOfflineStatus, NoRelations } from "../types";

export type JobpostOfflineStatusProps = ExtractProps<JobpostOfflineStatus>;

export type JobpostOfflineStatusInstance = NeogmaInstance<
  JobpostOfflineStatusProps,
  NoRelations
>;

export const JobpostOfflineStatuses = (
  neogma: Neogma,
): NeogmaModel<JobpostOfflineStatusProps, NoRelations> =>
  ModelFactory<JobpostOfflineStatusProps, NoRelations>(
    {
      label: "JobpostOfflineStatus",
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
