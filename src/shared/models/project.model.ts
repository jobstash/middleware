import {
  BindParam,
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import {
  ExtractProps,
  Project,
  ProjectCategory,
  ProjectDetails,
  ProjectMoreInfo,
  ProjectProperties,
} from "../types";
import { AuditInstance, AuditProps, Audits } from "./audit.model";
import { HackInstance, HackProps, Hacks } from "./hack.model";
import { ChainInstance, ChainProps, Chains } from "./chain.model";
import {
  ProjectCategories,
  ProjectCategoryInstance,
} from "./project-category.model";

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
  category: ModelRelatedNodesI<
    ReturnType<typeof ProjectCategories>,
    ProjectCategoryInstance
  >;
}

export interface ProjectMethods {
  getBaseProperties: () => ProjectProperties;
  getAudits: () => Promise<AuditInstance[]>;
  getAuditsData: () => Promise<AuditProps[]>;
  getHacks: () => Promise<HackInstance[]>;
  getHacksData: () => Promise<HackProps[]>;
  getChains: () => Promise<ChainInstance[]>;
  getChainsData: () => Promise<ChainProps[]>;
  getCategory: () => Promise<ProjectCategoryInstance[]>;
  getCategoryData: () => Promise<ProjectCategory[]>;
}

export interface ProjectStatics {
  getProjectsData: () => Promise<(Project & { orgName: string })[]>;
  getProjectsMoreInfoData: () => Promise<ProjectMoreInfo[]>;
  getProjectDetailsById: (id: string) => Promise<ProjectDetails | undefined>;
  getProjectsByCategory: (category: string) => Promise<ProjectProps[]>;
  getProjectCompetitors: (id: string) => Promise<ProjectProps[]>;
  searchProjects: (query: string) => Promise<ProjectProps[]>;
  getProjectById: (id: string) => Promise<ProjectProps | undefined>;
}

export const Projects = (
  neogma: Neogma,
): NeogmaModel<
  ProjectProps,
  ProjectRelations,
  ProjectMethods,
  ProjectStatics
> =>
  ModelFactory<ProjectProps, ProjectRelations, ProjectStatics, ProjectMethods>(
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
        category: {
          model: ProjectCategories(neogma),
          direction: "out",
          name: "HAS_CATEGORY",
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
        getCategory: async function () {
          return (await this.findRelationships({ alias: "category" })).map(
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
        getCategoryData: async function () {
          return (await this.findRelationships({ alias: "category" })).map(
            ref => ref.target.getDataValues(),
          );
        },
        getHacksData: async function () {
          return (await this.findRelationships({ alias: "hacks" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
      },
      statics: {
        getProjectsData: async function () {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                {
                  direction: "out",
                  name: "HAS_PROJECT",
                },
                {
                  label: "Project",
                  identifier: "project",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_CATEGORY",
                },
                {
                  label: "ProjectCategory",
                  identifier: "project_category",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_AUDIT",
                },
                {
                  label: "Audit",
                  identifier: "audit",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_HACK",
                },
                {
                  label: "Hack",
                  identifier: "hack",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "IS_DEPLOYED_ON_CHAIN",
                },
                {
                  label: "Chain",
                  identifier: "chain",
                },
              ],
            })
            .with([
              "project_category",
              "project",
              "organization",
              "COLLECT(DISTINCT PROPERTIES(hack)) as hacks",
              "COLLECT(DISTINCT PROPERTIES(audit)) as audits",
              "COLLECT(DISTINCT PROPERTIES(chain)) as chains",
            ])
            .return(
              `
              COLLECT(DISTINCT {
                id: project.id,
                name: project.name,
                url: project.url,
                logo: project.logo,
                tokenSymbol: project.tokenSymbol,
                tvl: project.tvl,
                monthlyVolume: project.monthlyVolume,
                monthlyFees: project.monthlyFees,
                monthlyRevenue: project.monthlyRevenue,
                monthlyActiveUsers: project.monthlyActiveUsers,
                isMainnet: project.isMainnet,
                orgName: organization.name,
                orgId: project.orgId,
                teamSize: project.teamSize,
                category: project_category.name,
                hacks: [hack in hacks WHERE hack.id IS NOT NULL],
                audits: [audit in audits WHERE audit.id IS NOT NULL],
                chains: [chain in chains WHERE chain.id IS NOT NULL]
              }) AS projects
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: (Project & { orgName: string })[] = result?.records[0]
            .get("projects")
            .map(record => record as Project & { orgName: string });
          return projects;
        },
        getProjectsMoreInfoData: async function () {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                {
                  direction: "out",
                  name: "HAS_PROJECT",
                },
                {
                  label: "Project",
                  identifier: "project",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_CATEGORY",
                },
                {
                  label: "ProjectCategory",
                  identifier: "project_category",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_AUDIT",
                },
                {
                  label: "Audit",
                  identifier: "audit",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_HACK",
                },
                {
                  label: "Hack",
                  identifier: "hack",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "IS_DEPLOYED_ON_CHAIN",
                },
                {
                  label: "Chain",
                  identifier: "chain",
                },
              ],
            })
            .with([
              "project_category",
              "project",
              "COLLECT(DISTINCT PROPERTIES(hack)) as hacks",
              "COLLECT(DISTINCT PROPERTIES(audit)) as audits",
              "COLLECT(DISTINCT PROPERTIES(chain)) as chains",
            ])
            .return(
              `
              COLLECT(DISTINCT {
                id: project.id,
                defiLlamaId: project.defiLlamaId,
                defiLlamaSlug: project.defiLlamaSlug,
                defiLlamaParent: project.defiLlamaParent,
                name: project.name,
                description: project.description,
                url: project.url,
                logo: project.logo,
                tokenAddress: project.tokenAddress,
                tokenSymbol: project.tokenSymbol,
                isInConstruction: project.isInConstruction,
                tvl: project.tvl,
                monthlyVolume: project.monthlyVolume,
                monthlyFees: project.monthlyFees,
                monthlyRevenue: project.monthlyRevenue,
                monthlyActiveUsers: project.monthlyActiveUsers,
                isMainnet: project.isMainnet,
                telegram: project.telegram,
                orgId: project.orgId,
                cmcId: project.cmcId,
                twitter: project.twitter,
                discord: project.discord,
                docs: project.docs,
                teamSize: project.teamSize,
                githubOrganization: project.githubOrganization,
                category: project_category.name,
                createdTimestamp: project.createdTimestamp,
                updatedTimestamp: project.updatedTimestamp,
                hacks: [hack in hacks WHERE hack.id IS NOT NULL],
                audits: [audit in audits WHERE audit.id IS NOT NULL],
                chains: [chain in chains WHERE chain.id IS NOT NULL]
              }) AS projects
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: ProjectMoreInfo[] = result?.records[0]
            .get("projects")
            .map(record => record as ProjectMoreInfo);
          return projects;
        },
        getProjectDetailsById: async function (id: string) {
          const query = new QueryBuilder()
            .match({
              label: "Project",
              identifier: "project",
              where: {
                id: id,
              },
            })
            .match({
              optional: true,
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                {
                  direction: "out",
                  name: "HAS_PROJECT",
                },
                {
                  identifier: "project",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_CATEGORY",
                },
                {
                  label: "ProjectCategory",
                  identifier: "project_category",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_AUDIT",
                },
                {
                  label: "Audit",
                  identifier: "audit",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "HAS_HACK",
                },
                {
                  label: "Hack",
                  identifier: "hack",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "project",
                },
                {
                  direction: "out",
                  name: "IS_DEPLOYED_ON_CHAIN",
                },
                {
                  label: "Chain",
                  identifier: "chain",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "organization",
                },
                {
                  direction: "out",
                  name: "HAS_JOBSITE",
                },
                {
                  label: "Jobsite",
                  identifier: "jobsite",
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
              optional: true,
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
              optional: true,
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
            .match({
              optional: true,
              related: [
                {
                  identifier: "structured_jobpost",
                },
                {
                  direction: "out",
                  name: "USES_TECHNOLOGY",
                },
                {
                  label: "Technology",
                  identifier: "technology",
                },
              ],
            })
            .raw("WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()")
            .match({
              optional: true,
              related: [
                {
                  identifier: "organization",
                },
                {
                  direction: "out",
                  name: "HAS_FUNDING_ROUND",
                },
                {
                  label: "FundingRound",
                  identifier: "funding_round",
                },
              ],
            })
            .match({
              optional: true,
              related: [
                {
                  identifier: "funding_round",
                },
                {
                  direction: "out",
                  name: "INVESTED_BY",
                },
                {
                  label: "Investor",
                  identifier: "investor",
                },
              ],
            })
            .with([
              "project",
              "organization",
              "project_category",
              "COLLECT(DISTINCT PROPERTIES(investor)) AS investors",
              "COLLECT(DISTINCT PROPERTIES(technology)) AS technologies",
              "COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds",
              "COLLECT(DISTINCT PROPERTIES(hack)) as hacks",
              "COLLECT(DISTINCT PROPERTIES(audit)) as audits",
              "COLLECT(DISTINCT PROPERTIES(chain)) as chains",
            ])
            .return(
              `
              {
                id: project.id,
                defiLlamaId: project.defiLlamaId,
                defiLlamaSlug: project.defiLlamaSlug,
                defiLlamaParent: project.defiLlamaParent,
                name: project.name,
                description: project.description,
                url: project.url,
                logo: project.logo,
                tokenAddress: project.tokenAddress,
                tokenSymbol: project.tokenSymbol,
                isInConstruction: project.isInConstruction,
                tvl: project.tvl,
                monthlyVolume: project.monthlyVolume,
                monthlyFees: project.monthlyFees,
                monthlyRevenue: project.monthlyRevenue,
                monthlyActiveUsers: project.monthlyActiveUsers,
                isMainnet: project.isMainnet,
                telegram: project.telegram,
                orgId: project.orgId,
                cmcId: project.cmcId,
                twitter: project.twitter,
                discord: project.discord,
                docs: project.docs,
                teamSize: project.teamSize,
                githubOrganization: project.githubOrganization,
                category: project_category.name,
                createdTimestamp: project.createdTimestamp,
                updatedTimestamp: project.updatedTimestamp,
                organization: {
                  id: organization.id,
                  orgId: organization.orgId,
                  name: organization.name,
                  description: organization.description,
                  summary: organization.summary,
                  location: organization.location,
                  url: organization.url,
                  twitter: organization.twitter,
                  discord: organization.discord,
                  github: organization.github,
                  telegram: organization.telegram,
                  docs: organization.docs,
                  jobsiteLink: organization.jobsiteLink,
                  createdTimestamp: organization.createdTimestamp,
                  updatedTimestamp: organization.updatedTimestamp,
                  fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
                  investors: [investor in investors WHERE investor.id IS NOT NULL],
                  technologies: [technology in technologies WHERE technology.id IS NOT NULL]
                },
                hacks: [hack in hacks WHERE hack.id IS NOT NULL],
                audits: [audit in audits WHERE audit.id IS NOT NULL],
                chains: [chain in chains WHERE chain.id IS NOT NULL]
              } AS project
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const project: ProjectDetails = result?.records[0]?.get(
            "project",
          ) as ProjectDetails;
          return project;
        },
        getProjectsByCategory: async function (category: string) {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
                { name: "HAS_CATEGORY", direction: "out" },
                {
                  label: "ProjectCategory",
                  where: {
                    name: category,
                  },
                },
              ],
            })
            .return("PROPERTIES(project) as result");
          const result = await query.run(neogma.queryRunner);
          return result.records.map(
            record => record.get("result") as ProjectMoreInfo,
          );
        },
        getProjectCompetitors: async function (id: string) {
          const params = new BindParam({ id });
          const query = new QueryBuilder(params)
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
                { name: "HAS_CATEGORY", direction: "out" },
                {
                  label: "ProjectCategory",
                },
              ],
            })
            .raw("WHERE project.id <> $id")
            .return("PROPERTIES(project) as result");
          const result = await query.run(neogma.queryRunner);
          return result.records.map(
            record => record.get("result") as ProjectMoreInfo,
          );
        },
        getProjectById: async function (id: string) {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                  where: { id: id },
                },
              ],
            })
            .return("PROPERTIES(project) as result");
          const result = await query.run(neogma.queryRunner);
          return result?.records[0]?.get("result") as ProjectProps;
        },
        searchProjects: async function (query: string) {
          const params = new BindParam({ query: `(?i).*${query}.*` });
          const searchQuery = new QueryBuilder(params)
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
              ],
            })
            .raw("WHERE project.name =~ $query")
            .return("PROPERTIES(project) as result");
          const result = await searchQuery.run(neogma.queryRunner);
          return result.records.map(
            record => record.get("result") as ProjectMoreInfo,
          );
        },
      },
    },
    neogma,
  );
