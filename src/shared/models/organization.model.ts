import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { OrganizationProperties, ProjectMoreInfo } from "../types";
import { ExtractProps } from "../types";
import { Jobsites, JobsiteInstance, JobsiteProps } from "./jobsite.model";
import { Projects, ProjectInstance, ProjectProps } from "./project.model";
import {
  FundingRounds,
  FundingRoundInstance,
  FundingRoundProps,
} from "./funding-round.model";
import { InvestorProps, Investors } from "./investor.model";
import { DiscordInstance, Discords } from "./discord.model";
import { DocsiteInstance, Docsites } from "./docsite.model";
import { TelegramInstance, Telegrams } from "./telegram.model";
import { TwitterInstance, Twitters } from "./twitter.model";
import { WebsiteInstance, Websites } from "./website.model";

export type OrganizationProps = ExtractProps<OrganizationProperties>;

export type OrganizationInstance = NeogmaInstance<
  OrganizationProps,
  OrganizationRelations,
  OrganizationMethods
>;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OrganizationStatics {}

export interface OrganizationMethods {
  getJobsites: () => Promise<JobsiteInstance[]>;
  getProjects: () => Promise<ProjectInstance[]>;
  getFundingRounds: () => Promise<FundingRoundInstance[]>;
  getInvestorsData: () => Promise<InvestorProps[]>;
  getJobsitesData: () => Promise<JobsiteProps[]>;
  getProjectsData: () => Promise<ProjectProps[]>;
  getProjectsMoreInfoData: () => Promise<ProjectMoreInfo[]>;
  getFundingRoundsData: () => Promise<FundingRoundProps[]>;
}

export interface OrganizationRelations {
  jobsite: ModelRelatedNodesI<ReturnType<typeof Jobsites>, JobsiteInstance>;
  projects: ModelRelatedNodesI<ReturnType<typeof Projects>, ProjectInstance>;
  fundingRounds: ModelRelatedNodesI<
    ReturnType<typeof FundingRounds>,
    FundingRoundInstance
  >;
  discord: ModelRelatedNodesI<ReturnType<typeof Discords>, DiscordInstance>;
  docsite: ModelRelatedNodesI<ReturnType<typeof Docsites>, DocsiteInstance>;
  twitter: ModelRelatedNodesI<ReturnType<typeof Twitters>, TwitterInstance>;
  telegram: ModelRelatedNodesI<ReturnType<typeof Telegrams>, TelegramInstance>;
  website: ModelRelatedNodesI<ReturnType<typeof Websites>, WebsiteInstance>;
}

export const Organizations = (
  neogma: Neogma,
): NeogmaModel<
  OrganizationProps,
  OrganizationRelations,
  OrganizationMethods,
  OrganizationStatics
> =>
  ModelFactory<
    OrganizationProps,
    OrganizationRelations,
    OrganizationStatics,
    OrganizationMethods
  >(
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
        logoUrl: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        headCount: {
          type: "number",
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
        getFundingRounds: async function () {
          return (await this.findRelationships({ alias: "fundingRounds" })).map(
            ref => ref.target,
          );
        },
        getJobsites: async function () {
          return (await this.findRelationships({ alias: "jobsite" })).map(
            ref => ref.target,
          );
        },
        getProjects: async function () {
          return (await this.findRelationships({ alias: "projects" })).map(
            ref => ref.target,
          );
        },
        getFundingRoundsData: async function () {
          return (await this.findRelationships({ alias: "fundingRounds" })).map(
            ref => ref.target.getDataValues(),
          );
        },
        getJobsitesData: async function () {
          return (await this.findRelationships({ alias: "jobsite" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
        getProjectsData: async function () {
          return (await this.findRelationships({ alias: "projects" })).map(
            ref => ref.target.getDataValues(),
          );
        },
        getProjectsMoreInfoData: async function () {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  where: {
                    orgId: this.orgId,
                  },
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
        getInvestorsData: async function () {
          const result = await new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  where: {
                    orgId: this.orgId,
                  },
                },
                {
                  direction: "out",
                  name: "HAS_FUNDING_ROUND",
                },
                {
                  label: "FundingRound",
                },
                {
                  direction: "out",
                  name: "INVESTED_BY",
                },
                { label: "Investor", identifier: "investor" },
              ],
            })
            .return("COLLECT(DISTINCT investor) as investors")
            .run(neogma.queryRunner);
          const investors: InvestorProps[] = [];
          for (const record of result.records[0].get("investors") as []) {
            investors.push(
              Investors(neogma).buildFromRecord(record).getDataValues(),
            );
          }
          return investors;
        },
      },
    },
    neogma,
  );
