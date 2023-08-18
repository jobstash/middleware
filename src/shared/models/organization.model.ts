import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { OrganizationProperties } from "../types";
import { ExtractProps } from "../types";
import { Jobsites, JobsiteInstance } from "./jobsite.model";
import { Projects, ProjectInstance } from "./project.model";
import { FundingRounds, FundingRoundInstance } from "./funding-round.model";

export type OrganizationProps = ExtractProps<OrganizationProperties>;

export type OrganizationInstance = NeogmaInstance<
  OrganizationProps,
  OrganizationRelations
>;

export interface OrganizationRelations {
  jobsite: ModelRelatedNodesI<ReturnType<typeof Jobsites>, JobsiteInstance>;
  projects: ModelRelatedNodesI<ReturnType<typeof Projects>, ProjectInstance>;
  fundingRounds: ModelRelatedNodesI<
    ReturnType<typeof FundingRounds>,
    FundingRoundInstance
  >;
}

export const Organizations = (
  neogma: Neogma,
): NeogmaModel<OrganizationProps, OrganizationRelations> =>
  ModelFactory<OrganizationProps, OrganizationRelations>(
    {
      label: "Organization",
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
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        orgId: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        summary: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        location: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        description: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        docs: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        logo: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        github: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        altName: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        discord: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        twitter: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        telegram: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        headCount: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        jobsiteLink: {
          type: "string",
          allowEmpty: true,
          required: false,
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
        jobsite: {
          model: Jobsites(neogma),
          direction: "out",
          name: "HAS_JOBSITE",
        },
        projects: {
          model: Projects(neogma),
          direction: "out",
          name: "HAS_PROJECT",
        },
        fundingRounds: {
          model: FundingRounds(neogma),
          direction: "out",
          name: "HAS_FUNDING_ROUND",
        },
      },
    },
    neogma,
  );
