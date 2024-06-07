import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { StructuredJobpost } from "../interfaces";
import { ExtractProps } from "../types";
import { TagInstance, Tags, TagProps } from "./tag.model";
import { OrganizationInstance, Organizations } from "./organization.model";
import {
  JobpostCommitmentInstance,
  JobpostCommitments,
} from "./jobpost-commitment.model";
import {
  JobpostClassificationInstance,
  JobpostClassifications,
} from "./jobpost-classification.model";
import {
  JobpostLocationTypeInstance,
  JobpostLocationTypes,
} from "./jobpost-location-type.model";
import {
  JobpostOfflineStatusInstance,
  JobpostOfflineStatuses,
} from "./jobpost-offline-status.model";
import {
  JobpostOnlineStatusInstance,
  JobpostOnlineStatuses,
} from "./jobpost-online-status.model";
import {
  BlockedDesignationInstance,
  BlockedDesignations,
} from "./blocked-designation.model";

export type StructuredJobpostProps = ExtractProps<
  Omit<StructuredJobpost, "tags">
>;

export type StructuredJobpostInstance = NeogmaInstance<
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobpostMethods
>;

export interface StructuredJobpostMethods {
  getUnblockedTags: () => Promise<TagInstance[]>;
  getUnblockedTagsData: () => Promise<TagProps[]>;
  getJobpostClassification: () => Promise<JobpostClassificationInstance>;
}

export interface StructuredJobposStatics {
  getJobOrgByUUID: (uuid: string) => Promise<OrganizationInstance | undefined>;
}

export interface StructuredJobpostRelations {
  tags: ModelRelatedNodesI<ReturnType<typeof Tags>, TagInstance>;
  commitment: ModelRelatedNodesI<
    ReturnType<typeof JobpostCommitments>,
    JobpostCommitmentInstance,
    { creator: string },
    { creator: string }
  >;
  locationType: ModelRelatedNodesI<
    ReturnType<typeof JobpostLocationTypes>,
    JobpostLocationTypeInstance,
    { creator: string },
    { creator: string }
  >;
  classification: ModelRelatedNodesI<
    ReturnType<typeof JobpostClassifications>,
    JobpostCommitmentInstance,
    { creator: string },
    { creator: string }
  >;
  onlineStatus: ModelRelatedNodesI<
    ReturnType<typeof JobpostOnlineStatuses>,
    JobpostOnlineStatusInstance,
    { creator: string },
    { creator: string }
  >;
  offlineStatus: ModelRelatedNodesI<
    ReturnType<typeof JobpostOfflineStatuses>,
    JobpostOfflineStatusInstance,
    { creator: string },
    { creator: string }
  >;
  blocked: ModelRelatedNodesI<
    ReturnType<typeof BlockedDesignations>,
    BlockedDesignationInstance,
    { creator: string },
    { creator: string }
  >;
}

export const StructuredJobposts = (
  neogma: Neogma,
): NeogmaModel<
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobpostMethods,
  StructuredJobposStatics
> =>
  ModelFactory<
    StructuredJobpostProps,
    StructuredJobpostRelations,
    StructuredJobposStatics,
    StructuredJobpostMethods
  >(
    {
      label: "StructuredJobpost",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        shortUUID: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        access: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        url: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        timestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        culture: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        description: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        benefits: {
          type: "array",
          allowEmpty: true,
          required: false,
        },
        location: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        title: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        seniority: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        summary: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        requirements: {
          type: "array",
          allowEmpty: false,
          required: true,
        },
        responsibilities: {
          type: "array",
          allowEmpty: false,
          required: true,
        },
        salary: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        paysInCrypto: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
        featured: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
        featureStartDate: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        featureEndDate: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        minimumSalary: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        maximumSalary: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        salaryCurrency: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        offersTokenAllocation: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
      },
      primaryKeyField: "id",
      relationships: {
        tags: {
          model: Tags(neogma),
          direction: "out",
          name: "HAS_TAG",
        },
        commitment: {
          model: JobpostCommitments(neogma),
          direction: "out",
          name: "HAS_COMMITMENT",
          properties: {
            creator: {
              property: "creator",
              schema: {
                type: "string",
                allowEmpty: true,
                required: false,
              },
            },
          },
        },
        locationType: {
          model: JobpostLocationTypes(neogma),
          direction: "out",
          name: "HAS_LOCATION_TYPE",
          properties: {
            creator: {
              property: "creator",
              schema: {
                type: "string",
                allowEmpty: true,
                required: false,
              },
            },
          },
        },
        classification: {
          model: JobpostClassifications(neogma),
          direction: "out",
          name: "HAS_CLASSIFICATION",
          properties: {
            creator: {
              property: "creator",
              schema: {
                type: "string",
                allowEmpty: true,
                required: false,
              },
            },
          },
        },
        onlineStatus: {
          model: JobpostOnlineStatuses(neogma),
          direction: "out",
          name: "HAS_STATUS",
          properties: {
            creator: {
              property: "creator",
              schema: {
                type: "string",
                allowEmpty: true,
                required: false,
              },
            },
          },
        },
        offlineStatus: {
          model: JobpostOfflineStatuses(neogma),
          direction: "out",
          name: "HAS_STATUS",
          properties: {
            creator: {
              property: "creator",
              schema: {
                type: "string",
                allowEmpty: true,
                required: false,
              },
            },
          },
        },
        blocked: {
          model: BlockedDesignations(neogma),
          direction: "out",
          name: "HAS_JOB_DESIGNATION",
          properties: {
            creator: {
              property: "creator",
              schema: {
                type: "string",
                allowEmpty: true,
                required: false,
              },
            },
          },
        },
      },
      methods: {
        getUnblockedTags: async function (): Promise<TagInstance[]> {
          const tags: TagInstance[] = [];
          const allTags = await this.findRelationships({
            alias: "tags",
          });
          for (const tag of allTags) {
            const isBlockedTag = await tag.target.isBlockedTag();
            if (!isBlockedTag) {
              tags.push(tag.target);
            }
          }
          return tags;
        },
        getUnblockedTagsData: async function (): Promise<TagProps[]> {
          const query = new QueryBuilder()
            .match({
              optional: true,
              related: [
                {
                  label: "StructuredJobpost",
                  where: {
                    shortUUID: this.shortUUID,
                  },
                },
                {
                  direction: "out",
                  name: "HAS_TAG",
                },
                {
                  label: "Tag",
                  identifier: "tag",
                },
              ],
            })
            .raw("WHERE NOT (tag)<-[:IS_BLOCKED_TAG]-()")
            .with("COLLECT(DISTINCT PROPERTIES(tag)) as tags")
            .return("tags");
          const result = await query.run(neogma.queryRunner);
          const tags: TagProps[] = result?.records[0]
            ?.get("tags")
            ?.map(record => record as TagProps);
          return tags;
        },
        getJobpostClassification:
          async function (): Promise<JobpostClassificationInstance> {
            const query = new QueryBuilder()
              .match({
                related: [
                  {
                    label: "Jobpost",
                    identifier: "jobPost",
                  },
                  {
                    name: "IS_CATEGORIZED_AS",
                    direction: "none",
                  },
                  {
                    label: "JobpostCategory",
                    identifier: "category",
                  },
                ],
              })
              .match({
                related: [
                  {
                    identifier: "jobPost",
                  },
                  {
                    name: "HAS_STRUCTURED_JOBPOST",
                    direction: "out",
                  },
                  {
                    label: "StructuredJobpost",
                    where: {
                      shortUUID: this.shortUUID,
                    },
                  },
                ],
              })
              .return("category");
            const result = (
              await query.run(neogma.queryRunner)
            ).records[0]?.get("category");
            return JobpostClassifications(neogma).buildFromRecord(result);
          },
      },
      statics: {
        getJobOrgByUUID: async function (
          uuid: string,
        ): Promise<OrganizationInstance | undefined> {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                {
                  name: "HAS_JOBSITE",
                  direction: "out",
                },
                {
                  label: "Jobsite",
                },
                {
                  name: "HAS_JOBPOST",
                  direction: "out",
                },
                {
                  label: "Jobpost",
                  identifier: "jobPost",
                },
                {
                  name: "IS_CATEGORIZED_AS",
                  direction: "out",
                },
                {
                  label: "JobpostCategory",
                  where: {
                    name: "technical",
                  },
                },
              ],
            })
            .match({
              related: [
                {
                  identifier: "jobPost",
                },
                {
                  name: "HAS_STATUS",
                  direction: "out",
                },
                {
                  label: "JobpostStatus",
                  where: {
                    status: "active",
                  },
                },
              ],
            })
            .match({
              related: [
                {
                  identifier: "jobPost",
                },
                {
                  name: "HAS_STRUCTURED_JOBPOST",
                  direction: "out",
                },
                {
                  label: "StructuredJobpost",
                  where: {
                    shortUUID: uuid,
                  },
                },
              ],
            })
            .return("organization");
          const result = (await query.run(neogma.queryRunner)).records[0].get(
            "organization",
          );
          return result
            ? Organizations(neogma).buildFromRecord(result)
            : undefined;
        },
      },
    },
    neogma,
  );
