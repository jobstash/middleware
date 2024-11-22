import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { ExtractProps, Jobsite } from "../types";
import { JobpostInstance, Jobposts } from "./jobpost.model";
import { OrganizationInstance, Organizations } from "./organization.model";

export type JobsiteProps = ExtractProps<Jobsite>;

export type JobsiteInstance = NeogmaInstance<
  JobsiteProps,
  JobsiteRelations,
  JobsiteMethods
>;

export interface JobsiteMethods {
  getOrganization: () => Promise<OrganizationInstance | null>;
  getJobposts: () => Promise<JobpostInstance[]>;
}

export interface JobsiteStatics {
  getAllJobsitesData: () => Promise<
    (Jobsite & { projectId: string; orgId: string })[]
  >;
}

export interface JobsiteRelations {
  jobposts: ModelRelatedNodesI<ReturnType<typeof Jobposts>, JobpostInstance>;
}

export const Jobsites = (
  neogma: Neogma,
): NeogmaModel<
  JobsiteProps,
  JobsiteRelations,
  JobsiteMethods,
  JobsiteStatics
> =>
  ModelFactory<JobsiteProps, JobsiteRelations, JobsiteStatics, JobsiteMethods>(
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
        type: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        createdTimestamp: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        updatedTimestamp: {
          type: "number",
          allowEmpty: true,
          required: false,
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
      },
      statics: {
        getAllJobsitesData: async function (): Promise<
          (Jobsite & { projectId: string; orgId: string })[]
        > {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Jobsite",
                  identifier: "jobSite",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
                { direction: "out", name: "HAS_JOBSITE" },
                {
                  identifier: "jobSite",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                { direction: "out", name: "HAS_JOBSITE" },
                {
                  identifier: "jobSite",
                },
              ],
            })
            .return(
              `
              {
                id: jobSite.id,
                url: jobSite.url,
                type: jobSite.type,
                updatedTimestamp: jobSite.updatedTimestamp,
                createdTimestamp: jobSite.createdTimestamp,
                projectId: project.id,
                orgId: organization.orgId
              } as jobSite
            `,
            );
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record => {
            const res: {
              id: string;
              url: string;
              type: string;
              projectId: string;
              orgId: string;
              createdTimestamp: number;
              updatedTimestamp: number;
            } = record.get("jobSite");
            return {
              ...res,
              projectId: res.projectId ?? null,
              orgId: res.orgId ?? null,
            } as {
              id: string;
              url: string;
              type: string;
              projectId: string;
              orgId: string;
              createdTimestamp: number;
              updatedTimestamp: number;
            };
          });
        },
      },
    },
    neogma,
  );
