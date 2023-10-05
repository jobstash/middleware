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
  ProjectCategory,
  ProjectDetails,
  ProjectMoreInfo,
  Project,
  ProjectDetailsEntity,
  ProjectMoreInfoEntity,
} from "../types";
import { AuditInstance, AuditProps, Audits } from "./audit.model";
import { HackInstance, HackProps, Hacks } from "./hack.model";
import { ChainInstance, ChainProps, Chains } from "./chain.model";
import {
  ProjectCategories,
  ProjectCategoryInstance,
} from "./project-category.model";
import { DiscordInstance, Discords } from "./discord.model";
import { DocsiteInstance, Docsites } from "./docsite.model";
import { TwitterInstance, Twitters } from "./twitter.model";
import { TelegramInstance, Telegrams } from "./telegram.model";
import { WebsiteInstance, Websites } from "./website.model";
import {
  GithubOrganizationInstance,
  GithubOrganizations,
} from "./github-organization.model";
import { ProjectWithRelations } from "../interfaces/project-with-relations.interface";
import { ProjectEntity } from "../entities/project.entity";

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
  discord: ModelRelatedNodesI<ReturnType<typeof Discords>, DiscordInstance>;
  docsite: ModelRelatedNodesI<ReturnType<typeof Docsites>, DocsiteInstance>;
  github: ModelRelatedNodesI<
    ReturnType<typeof GithubOrganizations>,
    GithubOrganizationInstance
  >;
  twitter: ModelRelatedNodesI<ReturnType<typeof Twitters>, TwitterInstance>;
  telegram: ModelRelatedNodesI<ReturnType<typeof Telegrams>, TelegramInstance>;
  website: ModelRelatedNodesI<ReturnType<typeof Websites>, WebsiteInstance>;
}

export interface ProjectMethods {
  getBaseProperties: () => Project;
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
  getProjectsData: () => Promise<
    (ProjectWithRelations & { orgName: string })[]
  >;
  getProjectsMoreInfoData: () => Promise<ProjectWithRelations[]>;
  getProjectDetailsById: (id: string) => Promise<ProjectDetails | null>;
  getProjectsByCategory: (category: string) => Promise<ProjectProps[]>;
  getProjectCompetitors: (id: string) => Promise<ProjectProps[]>;
  searchProjects: (query: string) => Promise<ProjectProps[]>;
  getProjectById: (id: string) => Promise<ProjectProps | null>;
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
        discord: {
          model: Discords(neogma),
          direction: "out",
          name: "HAS_DISCORD",
        },
        docsite: {
          model: Docsites(neogma),
          direction: "out",
          name: "HAS_DOCSITE",
        },
        github: {
          model: GithubOrganizations(neogma),
          direction: "out",
          name: "HAS_GITHUB",
        },
        telegram: {
          model: Telegrams(neogma),
          direction: "out",
          name: "HAS_TELEGRAM",
        },
        twitter: {
          model: Twitters(neogma),
          direction: "out",
          name: "HAS_TWITTER",
        },
        website: {
          model: Websites(neogma),
          direction: "out",
          name: "HAS_WEBSITE",
        },
      },
      methods: {
        getBaseProperties: function (): Project {
          return {
            id: this.id,
            name: this.name,
            orgId: this.orgId,
            isMainnet: this.isMainnet,
            tvl: this.tvl,
            logo: this.logo,
            teamSize: this.teamSize,
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
            .return(
              `
              project {
                  .*,
                  orgId: organization.orgId,
                  orgName: organization.name,
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain) | chain { .* }
                  ]
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: (ProjectWithRelations & { orgName: string })[] =
            result?.records.map(
              record =>
                record.get("result") as ProjectWithRelations & {
                  orgName: string;
                },
            );
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
            .return(
              `
              project {
                  .*,
                  orgId: organization.orgId,
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain) | chain { .* }
                  ]
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: ProjectWithRelations[] = result?.records.map(
            record => record.get("result") as ProjectWithRelations,
          );
          return projects;
        },
        getProjectDetailsById: async function (id: string) {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                { direction: "out", name: "HAS_PROJECT" },
                {
                  label: "Project",
                  identifier: "project",
                  where: {
                    id: id,
                  },
                },
              ],
            })
            .return(
              `
              project {
                .*,
                orgId: organization.orgId,
                discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
                category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                twitter: [(project)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
                organization: [(organization)-[:HAS_PROJECT]->(project) | organization {
                  .*,
                  discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
                  alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
                  twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
                  fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
                  investors: [(organization)-[:HAS_FUNDING_ROUND|INVESTED_BY*2]->(investor) | investor { .* }],
                  jobs: [
                    (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost) | structured_jobpost {
                      .*,
                      classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                      commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                      locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0]
                    }
                  ],
                  tags: [(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_BLOCKED_TERM]-() | tag { .* }]
                }][0],
                hacks: [
                (project)-[:HAS_HACK]->(hack) | hack { .* }
                ],
                audits: [
                  (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                ],
                chains: [
                  (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain) | chain { .* }
                ]
              } AS project
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const project: ProjectDetails = result?.records[0]?.get("project")
            ? new ProjectDetailsEntity(
                result?.records[0]?.get("project"),
              ).getProperties()
            : null;
          return project;
        },
        getProjectsByCategory: async function (category: string) {
          const query = new QueryBuilder().match({
            related: [
              {
                label: "Organization",
                identifier: "organization",
              },
              { direction: "out", name: "HAS_PROJECT" },
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
          }).return(`
            project {
                .*,
                orgId: organization.orgId
            }
          `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record =>
            new ProjectMoreInfoEntity(record.get("project")).getProperties(),
          );
        },
        getProjectCompetitors: async function (id: string) {
          const params = new BindParam({ id });
          const query = new QueryBuilder(params)
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                { direction: "out", name: "HAS_PROJECT" },
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
            .raw("WHERE project.id <> $id").return(`
              project {
                .*,
                orgId: organization.orgId
              }
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record =>
            new ProjectMoreInfoEntity(record.get("project")).getProperties(),
          );
        },
        getProjectById: async function (id: string) {
          const query = new QueryBuilder().match({
            related: [
              {
                label: "Organization",
                identifier: "organization",
              },
              { direction: "out", name: "HAS_PROJECT" },
              {
                label: "Project",
                identifier: "project",
                where: { id: id },
              },
            ],
          }).return(`
              project {
                  .*,
                  orgId: organization.orgId
              }
            `);
          const result = await query.run(neogma.queryRunner);
          return result?.records[0]?.get("project")
            ? new ProjectEntity(
                result?.records[0]?.get("project"),
              ).getProperties()
            : null;
        },
        searchProjects: async function (query: string) {
          const params = new BindParam({ query: `(?i).*${query}.*` });
          const searchQuery = new QueryBuilder(params)
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                { direction: "out", name: "HAS_PROJECT" },
                {
                  label: "Project",
                  identifier: "project",
                },
              ],
            })
            .raw("WHERE project.name =~ $query").return(`
              project {
                  .*,
                  orgId: organization.orgId
              }
            `);
          const result = await searchQuery.run(neogma.queryRunner);
          return result.records.map(record =>
            new ProjectMoreInfoEntity(record.get("project")).getProperties(),
          );
        },
      },
    },
    neogma,
  );
