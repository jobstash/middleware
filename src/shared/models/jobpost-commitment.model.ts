import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostCommitment, NoRelations } from "../types";

export type JobpostCommitmentProps = ExtractProps<JobpostCommitment>;

export type JobpostCommitmentInstance = NeogmaInstance<
  JobpostCommitmentProps,
  NoRelations
>;

export const JobpostCommitments = (
  neogma: Neogma,
): NeogmaModel<JobpostCommitmentProps, NoRelations> =>
  ModelFactory<JobpostCommitmentProps, NoRelations>(
    {
      label: "JobpostCommitment",
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
          enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
