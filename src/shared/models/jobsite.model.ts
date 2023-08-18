import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, Jobsite } from "../types";
import { Jobposts, JobpostInstance } from "./jobpost.model";

export type JobsiteProps = ExtractProps<Jobsite>;

export type JobsiteInstance = NeogmaInstance<JobsiteProps, JobsiteRelations>;

export interface JobsiteRelations {
  jobposts: ModelRelatedNodesI<ReturnType<typeof Jobposts>, JobpostInstance>;
}

export const Jobsites = (
  neogma: Neogma,
): NeogmaModel<JobsiteProps, JobsiteRelations> =>
  ModelFactory<JobsiteProps, JobsiteRelations>(
    {
      label: "Jobsite",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        url: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
      relationships: {
        jobposts: {
          model: Jobposts(neogma),
          direction: "out",
          name: "HAS_JOBPOST",
        },
      },
    },
    neogma,
  );
