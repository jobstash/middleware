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
    },
    neogma,
  );
