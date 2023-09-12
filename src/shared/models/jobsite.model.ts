import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { ExtractProps, Jobsite } from "../types";
import { Jobposts, JobpostInstance } from "./jobpost.model";
import { OrganizationInstance, Organizations } from "./organization.model";
import {
  StructuredJobpostInstance,
  StructuredJobposts,
} from "./structured-jobpost.model";

export type JobsiteProps = ExtractProps<Jobsite>;

export type JobsiteInstance = NeogmaInstance<
  JobsiteProps,
  JobsiteRelations,
  JobsiteMethods
>;

export interface JobsiteMethods {
  getOrganization: () => Promise<OrganizationInstance | null>;
  getJobposts: () => Promise<JobpostInstance[]>;
  getTechnicalStructuredJobposts: () => Promise<StructuredJobpostInstance[]>;
  getAllStructuredJobposts: () => Promise<StructuredJobpostInstance[]>;
}

export interface JobsiteRelations {
  jobposts: ModelRelatedNodesI<ReturnType<typeof Jobposts>, JobpostInstance>;
}

export const Jobsites = (
  neogma: Neogma,
): NeogmaModel<JobsiteProps, JobsiteRelations, JobsiteMethods> =>
  ModelFactory<JobsiteProps, JobsiteRelations, never, JobsiteMethods>(
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
      methods: {
        getOrganization:
          async function (): Promise<OrganizationInstance | null> {
            const result = await new QueryBuilder()
              .match({
                related: [
                  {
                    label: "Jobsite",
                    where: {
                      id: this.id,
                    },
                  },
                  {
                    direction: "in",
                    name: "HAS_JOBSITE",
                  },
                  {
                    label: "Organization",
                    identifier: "organization",
                  },
                ],
              })
              .return("organization")
              .run(neogma.queryRunner);
            const organization = Organizations(neogma).buildFromRecord(
              result.records[0].get("organization"),
            );
            return organization;
          },
        getJobposts: async function (): Promise<JobpostInstance[]> {
          return (await this.findRelationships({ alias: "jobposts" })).map(
            ref => ref.target,
          );
        },
        getTechnicalStructuredJobposts: async function (): Promise<
          StructuredJobpostInstance[]
        > {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Jobsite",
                  where: {
                    id: this.id,
                  },
                },
                {
                  direction: "out",
                  name: "HAS_JOBPOST",
                },
                {
                  label: "Jobpost",
                  identifier: "raw_jobpost",
                },
                {
                  direction: "none",
                  name: "IS_CATEGORIZED_AS",
                },
                { label: "JobpostCategory", where: { name: "technical" } },
              ],
            })
            .match({
              related: [
                {
                  identifier: "raw_jobpost",
                },
                {
                  direction: "out",
                  name: "HAS_STATUS",
                },
                { label: "JobpostStatus", where: { status: "active" } },
              ],
            })
            .match({
              related: [
                {
                  identifier: "raw_jobpost",
                },
                {
                  direction: "out",
                  name: "HAS_STRUCTURED_JOBPOST",
                },
                {
                  label: "StructuredJobpost",
                  identifier: "structured_jobpost",
                },
              ],
            })
            .return("structured_jobpost");
          const result = await query.run(neogma.queryRunner);
          const structuredJobposts: StructuredJobpostInstance[] = [];
          for (const record of result.records) {
            structuredJobposts.push(
              StructuredJobposts(neogma).buildFromRecord(
                record.get("structured_jobpost"),
              ),
            );
          }
          return structuredJobposts;
        },
        getAllStructuredJobposts: async function (): Promise<
          StructuredJobpostInstance[]
        > {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Jobsite",
                  where: {
                    id: this.id,
                  },
                },
                {
                  direction: "out",
                  name: "HAS_JOBPOST",
                },
                {
                  label: "Jobpost",
                  identifier: "raw_jobpost",
                },
              ],
            })
            .match({
              related: [
                {
                  identifier: "raw_jobpost",
                },
                {
                  direction: "out",
                  name: "HAS_STATUS",
                },
                { label: "JobpostStatus", where: { status: "active" } },
              ],
            })
            .match({
              related: [
                {
                  identifier: "raw_jobpost",
                },
                {
                  direction: "out",
                  name: "HAS_STRUCTURED_JOBPOST",
                },
                {
                  label: "StructuredJobpost",
                  identifier: "structured_jobpost",
                },
              ],
            })
            .return("structured_jobpost");
          const result = await query.run(neogma.queryRunner);
          const structuredJobposts: StructuredJobpostInstance[] = [];
          for (const record of result.records) {
            structuredJobposts.push(
              StructuredJobposts(neogma).buildFromRecord(
                record.get("structured_jobpost"),
              ),
            );
          }
          return structuredJobposts;
        },
      },
    },
    neogma,
  );
