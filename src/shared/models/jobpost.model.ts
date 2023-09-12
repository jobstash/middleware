import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, Jobpost } from "../types";
import {
  StructuredJobposts,
  StructuredJobpostInstance,
} from "./structured-jobpost.model";
import {
  JobpostCategories,
  JobpostCategoryInstance,
} from "./jobpost-category.model";
import { JobpostStatuses, JobpostStatusInstance } from "./jobpost-status.model";

export type JobpostProps = ExtractProps<Jobpost>;

export type JobpostInstance = NeogmaInstance<JobpostProps, JobpostRelations>;

export interface JobpostRelations {
  structuredJobpost: ModelRelatedNodesI<
    ReturnType<typeof StructuredJobposts>,
    StructuredJobpostInstance
  >;
  category: ModelRelatedNodesI<
    ReturnType<typeof JobpostCategories>,
    JobpostCategoryInstance
  >;
  status: ModelRelatedNodesI<
    ReturnType<typeof JobpostStatuses>,
    JobpostStatusInstance
  >;
}

export const Jobposts = (
  neogma: Neogma,
): NeogmaModel<JobpostProps, JobpostRelations> =>
  ModelFactory<JobpostProps, JobpostRelations>(
    {
      label: "Jobpost",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        title: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        source: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        location: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        shortUUID: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        jobsiteId: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        commitment: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        jobpageUrl: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        description: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        applypageUrl: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        foundTimestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        createdTimestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
      relationships: {
        structuredJobpost: {
          model: StructuredJobposts(neogma),
          direction: "out",
          name: "HAS_STRUCTURED_JOBPOST",
        },
        category: {
          model: JobpostCategories(neogma),
          direction: "in",
          name: "IS_CATEGORIZED_AS",
        },
        status: {
          model: JobpostStatuses(neogma),
          direction: "out",
          name: "HAS_STATUS",
        },
      },
    },
    neogma,
  );
