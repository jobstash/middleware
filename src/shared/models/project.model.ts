import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, ProjectMoreInfo, ProjectProperties } from "../types";
import { AuditInstance, AuditProps, Audits } from "./audit.model";
import { HackInstance, HackProps, Hacks } from "./hack.model";
import { ChainInstance, ChainProps, Chains } from "./chain.model";

export type ProjectProps = ExtractProps<
  Omit<ProjectMoreInfo, "audits" | "hacks" | "chains">
>;

export type ProjectInstance = NeogmaInstance<
  ProjectProps,
  ProjectRelations,
  ProjectMethods
>;

export interface ProjectRelations {
  audits: ModelRelatedNodesI<ReturnType<typeof Audits>, AuditInstance>;
  hacks: ModelRelatedNodesI<ReturnType<typeof Hacks>, HackInstance>;
  chains: ModelRelatedNodesI<ReturnType<typeof Chains>, ChainInstance>;
}

export interface ProjectMethods {
  getBaseProperties: () => ProjectProperties;
  getAudits: () => Promise<AuditInstance[]>;
  getAuditsData: () => Promise<AuditProps[]>;
  getHacks: () => Promise<HackInstance[]>;
  getHacksData: () => Promise<HackProps[]>;
  getChains: () => Promise<ChainInstance[]>;
  getChainsData: () => Promise<ChainProps[]>;
}

export const Projects = (
  neogma: Neogma,
): NeogmaModel<ProjectProps, ProjectRelations, never, ProjectMethods> =>
  ModelFactory<ProjectProps, ProjectRelations, never, ProjectMethods>(
    {
      label: "Project",
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
        description: {
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
        isMainnet: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
        tvl: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        logo: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        teamSize: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        category: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        tokenSymbol: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        monthlyFees: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        monthlyVolume: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        monthlyRevenue: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        monthlyActiveUsers: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        docs: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        twitter: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        discord: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        telegram: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        cmcId: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        defiLlamaId: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        tokenAddress: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        defiLlamaSlug: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        defiLlamaParent: {
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
        isInConstruction: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
        githubOrganization: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
      },
      primaryKeyField: "id",
      relationships: {
        audits: {
          model: Audits(neogma),
          direction: "out",
          name: "HAS_AUDIT",
        },
        chains: {
          model: Chains(neogma),
          direction: "out",
          name: "IS_DEPLOYED_ON_CHAIN",
        },
        hacks: {
          model: Hacks(neogma),
          direction: "out",
          name: "HAS_HACK",
        },
      },
      methods: {
        getBaseProperties: function (): ProjectProperties {
          return {
            id: this.id,
            url: this.url,
            name: this.name,
            orgId: this.orgId,
            isMainnet: this.isMainnet,
            tvl: this.tvl,
            logo: this.logo,
            teamSize: this.teamSize,
            category: this.category,
            tokenSymbol: this.tokenSymbol,
            monthlyFees: this.monthlyFees,
            monthlyVolume: this.monthlyVolume,
            monthlyRevenue: this.monthlyRevenue,
            monthlyActiveUsers: this.monthlyActiveUsers,
          };
        },
        getAudits: async function () {
          return (await this.findRelationships({ alias: "audits" })).map(
            ref => ref.target,
          );
        },
        getChains: async function () {
          return (await this.findRelationships({ alias: "chains" })).map(
            ref => ref.target,
          );
        },
        getHacks: async function () {
          return (await this.findRelationships({ alias: "hacks" })).map(
            ref => ref.target,
          );
        },
        getAuditsData: async function () {
          return (await this.findRelationships({ alias: "audits" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
        getChainsData: async function () {
          return (await this.findRelationships({ alias: "chains" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
        getHacksData: async function () {
          return (await this.findRelationships({ alias: "hacks" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
      },
    },
    neogma,
  );
