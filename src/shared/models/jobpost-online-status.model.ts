import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostOnlineStatus, NoRelations } from "../types";

export type JobpostOnlineStatusProps = ExtractProps<JobpostOnlineStatus>;

export type JobpostOnlineStatusInstance = NeogmaInstance<
  JobpostOnlineStatusProps,
  NoRelations
>;

export const JobpostOnlineStatuses = (
  neogma: Neogma,
): NeogmaModel<JobpostOnlineStatusProps, NoRelations> =>
  ModelFactory<JobpostOnlineStatusProps, NoRelations>(
    {
      label: "JobpostOnlineStatus",
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
