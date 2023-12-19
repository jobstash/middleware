import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { Organization, ProjectWithRelations } from "../types";
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
import {
  GithubOrganizationInstance,
  GithubOrganizations,
} from "./github-organization.model";
import {
  OrganizationAliasInstance,
  OrganizationAliases,
} from "./organization-alias.model";
import {
  OrganizationReviewInstance,
  OrganizationReviews,
} from "./organization-review.model";

export type OrganizationProps = ExtractProps<Organization>;

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
  getProjectsMoreInfoData: () => Promise<ProjectWithRelations[]>;
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
  alias: ModelRelatedNodesI<
    ReturnType<typeof OrganizationAliases>,
    OrganizationAliasInstance
  >;
  docs: ModelRelatedNodesI<ReturnType<typeof Docsites>, DocsiteInstance>;
  github: ModelRelatedNodesI<
    ReturnType<typeof GithubOrganizations>,
    GithubOrganizationInstance
  >;
  twitter: ModelRelatedNodesI<ReturnType<typeof Twitters>, TwitterInstance>;
  telegram: ModelRelatedNodesI<ReturnType<typeof Telegrams>, TelegramInstance>;
  website: ModelRelatedNodesI<ReturnType<typeof Websites>, WebsiteInstance>;
  reviews: ModelRelatedNodesI<
    ReturnType<typeof OrganizationReviews>,
    OrganizationReviewInstance
  >;
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
        headcountEstimate: {
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
        docs: {
          model: Docsites(neogma),
          direction: "out",
          name: "HAS_DOCSITE",
        },
        telegram: {
          model: Telegrams(neogma),
          direction: "out",
          name: "HAS_TELEGRAM",
        },
        github: {
          model: GithubOrganizations(neogma),
          direction: "out",
          name: "HAS_GITHUB",
        },
        alias: {
          model: OrganizationAliases(neogma),
          direction: "out",
          name: "HAS_ORGANIZATION_ALIAS",
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
        reviews: {
          model: OrganizationReviews(neogma),
          direction: "out",
          name: "HAS_REVIEW",
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
                  identifier: "organization",
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
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
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
                  name: "HAS_INVESTOR",
                },
                { label: "Investor", identifier: "investor" },
              ],
            })
            .return("investor")
            .run(neogma.queryRunner);
          const investors: InvestorProps[] = result.records.map(record =>
            Investors(neogma)
              .buildFromRecord(record?.get("investor"))
              .getDataValues(),
          );
          return investors;
        },
      },
    },
    neogma,
  );
