import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, JobpostFolder } from "../types";
import {
  StructuredJobpostInstance,
  StructuredJobposts,
} from "./structured-jobpost.model";

export type JobpostFolderProps = ExtractProps<Omit<JobpostFolder, "jobs">>;

export interface JobpostFolderRelations {
  jobs: ModelRelatedNodesI<
    ReturnType<typeof StructuredJobposts>,
    StructuredJobpostInstance
  >;
}

export type JobpostFolderInstance = NeogmaInstance<
  JobpostFolderProps,
  JobpostFolderRelations
>;

// export interface JobpostFolderStatics {
//   getUserFoldersByWallet: (wallet: string) => Promise<JobpostFolder[]>;
// }

// export interface JobpostFolderMethods {}

export const JobpostFolders = (
  neogma: Neogma,
): NeogmaModel<
  JobpostFolderProps,
  JobpostFolderRelations
  // JobpostFolderMethods,
  // JobpostFolderStatics
> =>
  ModelFactory<
    JobpostFolderProps,
    JobpostFolderRelations
    // JobpostFolderStatics,
    // JobpostFolderMethods
  >(
    {
      label: "JobpostFolder",
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
        slug: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        isPublic: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
      relationships: {
        jobs: {
          model: StructuredJobposts(neogma),
          direction: "out",
          name: "CONTAINS_JOBPOST",
        },
      },
    },
    neogma,
  );
