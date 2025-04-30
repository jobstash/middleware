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
  ProjectDetailsResult,
  ProjectMoreInfo,
  Project,
  ProjectDetailsEntity,
  ProjectMoreInfoEntity,
  StructuredJobpost,
  Repository,
  RawProjectWebsite,
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
import { GithubOrganizationInstance } from "./github-organization.model";
import { ProjectWithRelations } from "../interfaces/project-with-relations.interface";
import {
  StructuredJobpostInstance,
  StructuredJobposts,
} from "./structured-jobpost.model";
import { Repositories, RepositoryInstance } from "./repository.model";
import { Githubs } from "./github.model";

export type ProjectProps = ExtractProps<ProjectMoreInfo>;

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
  jobs: ModelRelatedNodesI<
    ReturnType<typeof StructuredJobposts>,
    StructuredJobpostInstance
  >;
  repos: ModelRelatedNodesI<
    ReturnType<typeof Repositories>,
    RepositoryInstance
  >;
  github: ModelRelatedNodesI<
    ReturnType<typeof Githubs>,
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
  getJobs: () => Promise<StructuredJobpostInstance[]>;
  getJobsData: () => Promise<StructuredJobpost[]>;
  getRepos: () => Promise<RepositoryInstance[]>;
  getReposData: () => Promise<Repository[]>;
}

export interface ProjectStatics {
  getAllProjectsData: () => Promise<
    (ProjectWithRelations & {
      rawWebsite: RawProjectWebsite;
    })[]
  >;
  getProjectsData: () => Promise<
    (ProjectWithRelations & { orgNames: string[]; ecosystems: string[] })[]
  >;
  getProjectsMoreInfoData: () => Promise<ProjectWithRelations[]>;
  getProjectDetailsById: (id: string) => Promise<ProjectDetailsResult | null>;
  getProjectDetailsBySlug: (
    slug: string,
  ) => Promise<ProjectDetailsResult | null>;
  getProjectsByCategory: (category: string) => Promise<ProjectProps[]>;
  getProjectCompetitors: (
    id: string,
    ecosystem: string | undefined,
  ) => Promise<ProjectWithRelations[]>;
  searchProjects: (query: string) => Promise<ProjectProps[]>;
  getProjectById: (id: string) => Promise<
    | (ProjectWithRelations & {
        orgNames: string[];
        ecosystems: string[];
      })
    | null
  >;
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
        summary: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        normalizedName: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        orgIds: {
          type: "string",
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
          name: "IS_DEPLOYED_ON",
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
          model: Githubs(neogma),
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
        jobs: {
          model: StructuredJobposts(neogma),
          direction: "out",
          name: "HAS_JOB",
        },
        repos: {
          model: Repositories(neogma),
          direction: "out",
          name: "HAS_REPOSITORY",
        },
      },
      methods: {
        getBaseProperties: function (): Project {
          return {
            id: this.id,
            name: this.name,
            orgIds: this.orgIds,
            tvl: this.tvl,
            logo: this.logo,
            tokenSymbol: this.tokenSymbol,
            monthlyFees: this.monthlyFees,
            monthlyVolume: this.monthlyVolume,
            monthlyRevenue: this.monthlyRevenue,
            normalizedName: this.normalizedName,
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
        getJobs: async function () {
          return (await this.findRelationships({ alias: "jobs" })).map(
            ref => ref.target,
          );
        },
        getRepos: async function () {
          return (await this.findRelationships({ alias: "repos" })).map(
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
        getJobsData: async function () {
          return (await this.findRelationships({ alias: "jobs" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
        getReposData: async function () {
          return (await this.findRelationships({ alias: "repos" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
        getHacksData: async function () {
          return (await this.findRelationships({ alias: "hacks" })).map(ref =>
            ref.target.getDataValues(),
          );
        },
      },
      statics: {
        getAllProjectsData: async function () {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = parallel")
            .match({
              label: "Project",
              identifier: "project",
            })
            .return(
              `
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  aliases: [
                    (project)-[:HAS_PROJECT_ALIAS]->(alias: ProjectAlias) | alias.name
                  ],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ],
                  rawWebsite: [
                    (project)-[:HAS_RAW_WEBSITE]->(website) | website {
                      id: website.id,
                      url: website.url,
                      category: website.category,
                      content: website.content,
                      defiLlamaId: website.defiLlamaId,
                      createdTimestamp: website.createdTimestamp,
                      metadata: [
                        (website)-[:HAS_RAW_WEBSITE_METADATA]->(metadata) | metadata {
                          copyrightName: website.copyrightName,
                          copyrightStart: website.copyrightStart,
                          createdTimestamp: website.createdTimestamp,
                          id: website.id,
                          isCrypto: website.isCrypto,
                          isEmpty: website.isEmpty,
                          isError: website.isError,
                          isParkedWebsite: website.isParkedWebsite,
                          secondpassCopyrightEnd: website.secondpassCopyrightEnd,
                          secondpassCopyrightName: website.secondpassCopyrightName,
                          secondpassCopyrightStart: website.secondpassCopyrightStart,
                          secondpassIsActive: website.secondpassIsActive,
                          secondpassIsCrypto: website.secondpassIsCrypto,
                          secondpassIsRenamed: website.secondpassIsRenamed,
                          updatedTimestamp: website.updatedTimestamp,
                          url: website.url
                        }
                      ][0]
                    }
                  ][0]
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: (ProjectWithRelations & {
            rawWebsite: RawProjectWebsite | null;
          })[] = result?.records?.map(
            record =>
              record.get("result") as ProjectWithRelations & {
                rawWebsite: RawProjectWebsite | null;
              },
          );
          return projects;
        },
        getProjectsData: async function () {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = parallel")
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
              ],
            })
            .raw(
              `
              OPTIONAL MATCH (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
              OPTIONAL MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
              OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(other:Tag)--(:PreferredDesignation)
              WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS tag, structured_jobpost, project
              OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(other:Tag)
              WITH apoc.coll.toSet(COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END)) AS tags, structured_jobpost, project
              WITH apoc.coll.toSet(COLLECT(structured_jobpost {
                  id: structured_jobpost.id,
                  url: structured_jobpost.url,
                  title: structured_jobpost.title,
                  access: structured_jobpost.access,
                  salary: structured_jobpost.salary,
                  culture: structured_jobpost.culture,
                  location: structured_jobpost.location,
                  summary: structured_jobpost.summary,
                  benefits: structured_jobpost.benefits,
                  shortUUID: structured_jobpost.shortUUID,
                  seniority: structured_jobpost.seniority,
                  description: structured_jobpost.description,
                  requirements: structured_jobpost.requirements,
                  paysInCrypto: structured_jobpost.paysInCrypto,
                  minimumSalary: structured_jobpost.minimumSalary,
                  maximumSalary: structured_jobpost.maximumSalary,
                  salaryCurrency: structured_jobpost.salaryCurrency,
                  onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
                  responsibilities: structured_jobpost.responsibilities,
                  featured: structured_jobpost.featured,
                  featureStartDate: structured_jobpost.featureStartDate,
                  featureEndDate: structured_jobpost.featureEndDate,
                  timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
                  offersTokenAllocation: structured_jobpost.offersTokenAllocation,
                  classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                  commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                  locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
                  tags: apoc.coll.toSet(tags)
              })) AS jobs, project
            `,
            )
            .return(
              `
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  orgNames: [(org)-[:HAS_PROJECT]->(project) | org.name],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  ecosystems: [
                    (organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem: OrganizationEcosystem) | ecosystem.name
                  ],
                  aliases: [
                    (project)-[:HAS_PROJECT_ALIAS]->(alias: ProjectAlias) | alias.name
                  ],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }],
                  jobs: jobs,
                  jobsites: [
                    (project)-[:HAS_JOBSITE]->(jobsite:Jobsite) | jobsite {
                      id: jobsite.id,
                      url: jobsite.url,
                      type: jobsite.type
                    }
                  ],
                  detectedJobsites: [
                    (project)-[:HAS_JOBSITE]->(jobsite:DetectedJobsite) | jobsite {
                      id: jobsite.id,
                      url: jobsite.url,
                      type: jobsite.type
                    }
                  ],
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ]
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: (ProjectWithRelations & {
            orgNames: string[];
            ecosystems: string[];
          })[] = result?.records?.map(
            record =>
              record.get("result") as ProjectWithRelations & {
                orgNames: string[];
                ecosystems: string[];
              },
          );
          return projects;
        },
        getProjectsMoreInfoData: async function () {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = parallel")
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
              ],
            })
            .raw(
              `
              OPTIONAL MATCH (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
              OPTIONAL MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
              OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(other:Tag)--(:PreferredDesignation)
              WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS tag, structured_jobpost, project
              OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(other:Tag)
              WITH apoc.coll.toSet(COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END)) AS tags, structured_jobpost, project
              WITH apoc.coll.toSet(COLLECT(structured_jobpost {
                  id: structured_jobpost.id,
                  url: structured_jobpost.url,
                  title: structured_jobpost.title,
                  access: structured_jobpost.access,
                  salary: structured_jobpost.salary,
                  culture: structured_jobpost.culture,
                  location: structured_jobpost.location,
                  summary: structured_jobpost.summary,
                  benefits: structured_jobpost.benefits,
                  shortUUID: structured_jobpost.shortUUID,
                  seniority: structured_jobpost.seniority,
                  description: structured_jobpost.description,
                  requirements: structured_jobpost.requirements,
                  paysInCrypto: structured_jobpost.paysInCrypto,
                  minimumSalary: structured_jobpost.minimumSalary,
                  maximumSalary: structured_jobpost.maximumSalary,
                  salaryCurrency: structured_jobpost.salaryCurrency,
                  onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
                  responsibilities: structured_jobpost.responsibilities,
                  featured: structured_jobpost.featured,
                  featureStartDate: structured_jobpost.featureStartDate,
                  featureEndDate: structured_jobpost.featureEndDate,
                  timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
                  offersTokenAllocation: structured_jobpost.offersTokenAllocation,
                  classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                  commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                  locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
                  tags: apoc.coll.toSet(tags)
              })) AS jobs, project
            `,
            )
            .return(
              `
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }],
                  jobs: jobs,
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ]
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: ProjectWithRelations[] = result?.records?.map(
            record => record.get("result") as ProjectWithRelations,
          );
          return projects;
        },
        getProjectDetailsById: async function (id: string) {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = pipelined")
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                  where: {
                    id: id,
                  },
                },
              ],
            })
            .raw(
              `
              OPTIONAL MATCH (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
              OPTIONAL MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
              OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(other:Tag)--(:PreferredDesignation)
              WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS tag, structured_jobpost, project
              OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(other:Tag)
              WITH apoc.coll.toSet(COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END)) AS tags, structured_jobpost, project
              WITH apoc.coll.toSet(COLLECT(structured_jobpost {
                  id: structured_jobpost.id,
                  url: structured_jobpost.url,
                  title: structured_jobpost.title,
                  access: structured_jobpost.access,
                  salary: structured_jobpost.salary,
                  culture: structured_jobpost.culture,
                  location: structured_jobpost.location,
                  summary: structured_jobpost.summary,
                  benefits: structured_jobpost.benefits,
                  shortUUID: structured_jobpost.shortUUID,
                  seniority: structured_jobpost.seniority,
                  description: structured_jobpost.description,
                  requirements: structured_jobpost.requirements,
                  paysInCrypto: structured_jobpost.paysInCrypto,
                  minimumSalary: structured_jobpost.minimumSalary,
                  maximumSalary: structured_jobpost.maximumSalary,
                  salaryCurrency: structured_jobpost.salaryCurrency,
                  onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
                  responsibilities: structured_jobpost.responsibilities,
                  featured: structured_jobpost.featured,
                  featureStartDate: structured_jobpost.featureStartDate,
                  featureEndDate: structured_jobpost.featureEndDate,
                  timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
                  offersTokenAllocation: structured_jobpost.offersTokenAllocation,
                  classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                  commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                  locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
                  tags: apoc.coll.toSet(tags)
              })) AS jobs, project
            `,
            )
            .return(
              `
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  organizations: [(organization)-[:HAS_PROJECT]->(project) | organization {
                    .*,
                    discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                    website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                    docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                    telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                    github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                    aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
                    twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                    fundingRounds: apoc.coll.toSet([
                      (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                    ]),
                    grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                      .*,
                      programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                    }],
                    investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
                    ecosystems: [(organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem) | ecosystem.name ] + [
                      (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
                    ],
                    tags: apoc.coll.toSet([
                      (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
                      WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag { .* }
                    ]),
                    reviews: [
                      (organization)-[:HAS_REVIEW]->(review:OrgReview) | review {
                        compensation: {
                          salary: review.salary,
                          currency: review.currency,
                          offersTokenAllocation: review.offersTokenAllocation
                        },
                        rating: {
                          onboarding: review.onboarding,
                          careerGrowth: review.careerGrowth,
                          benefits: review.benefits,
                          workLifeBalance: review.workLifeBalance,
                          diversityInclusion: review.diversityInclusion,
                          management: review.management,
                          product: review.product,
                          compensation: review.compensation
                        },
                        review: {
                          title: review.title,
                          location: review.location,
                          timezone: review.timezone,
                          pros: review.pros,
                          cons: review.cons
                        },
                        reviewedTimestamp: review.reviewedTimestamp
                      }
                    ]
                  }],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }],
                  jobs: jobs,
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ],
                  tags: apoc.coll.toSet([
                    (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
                    WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag { .* }
                  ])
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const project: ProjectDetailsResult = result?.records[0]?.get(
            "result",
          )
            ? new ProjectDetailsEntity(
                result?.records[0]?.get("result"),
              ).getProperties()
            : null;
          return project;
        },
        getProjectDetailsBySlug: async function (slug: string) {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = pipelined")
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                  where: {
                    normalizedName: slug,
                  },
                },
              ],
            })
            .raw(
              `
              OPTIONAL MATCH (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
              OPTIONAL MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
              OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(other:Tag)--(:PreferredDesignation)
              WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS tag, structured_jobpost, project
              OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(other:Tag)
              WITH apoc.coll.toSet(COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END)) AS tags, structured_jobpost, project
              WITH apoc.coll.toSet(COLLECT(structured_jobpost {
                  id: structured_jobpost.id,
                  url: structured_jobpost.url,
                  title: structured_jobpost.title,
                  access: structured_jobpost.access,
                  salary: structured_jobpost.salary,
                  culture: structured_jobpost.culture,
                  location: structured_jobpost.location,
                  summary: structured_jobpost.summary,
                  benefits: structured_jobpost.benefits,
                  shortUUID: structured_jobpost.shortUUID,
                  seniority: structured_jobpost.seniority,
                  description: structured_jobpost.description,
                  requirements: structured_jobpost.requirements,
                  paysInCrypto: structured_jobpost.paysInCrypto,
                  minimumSalary: structured_jobpost.minimumSalary,
                  maximumSalary: structured_jobpost.maximumSalary,
                  salaryCurrency: structured_jobpost.salaryCurrency,
                  onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
                  responsibilities: structured_jobpost.responsibilities,
                  featured: structured_jobpost.featured,
                  featureStartDate: structured_jobpost.featureStartDate,
                  featureEndDate: structured_jobpost.featureEndDate,
                  timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
                  offersTokenAllocation: structured_jobpost.offersTokenAllocation,
                  classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                  commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                  locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
                  tags: apoc.coll.toSet(tags)
              })) AS jobs, project
            `,
            )
            .return(
              `
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  organizations: [(organization)-[:HAS_PROJECT]->(project) | organization {
                    .*,
                    discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                    website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                    docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                    telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                    github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                    aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
                    twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                    fundingRounds: apoc.coll.toSet([
                      (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                    ]),
                    grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                      .*,
                      programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                    }],
                    investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
                    ecosystems: [(organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem) | ecosystem.name ] + [
                      (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
                    ],
                    tags: apoc.coll.toSet([
                      (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
                      WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag { .* }
                    ]),
                    reviews: [
                      (organization)-[:HAS_REVIEW]->(review:OrgReview) | review {
                        compensation: {
                          salary: review.salary,
                          currency: review.currency,
                          offersTokenAllocation: review.offersTokenAllocation
                        },
                        rating: {
                          onboarding: review.onboarding,
                          careerGrowth: review.careerGrowth,
                          benefits: review.benefits,
                          workLifeBalance: review.workLifeBalance,
                          diversityInclusion: review.diversityInclusion,
                          management: review.management,
                          product: review.product,
                          compensation: review.compensation
                        },
                        review: {
                          title: review.title,
                          location: review.location,
                          timezone: review.timezone,
                          pros: review.pros,
                          cons: review.cons
                        },
                        reviewedTimestamp: review.reviewedTimestamp
                      }
                    ]
                  }],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }],
                  jobs: jobs,
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ],
                  tags: apoc.coll.toSet([
                    (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
                    WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag { .* }
                  ])
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const project: ProjectDetailsResult = result?.records[0]?.get(
            "result",
          )
            ? new ProjectDetailsEntity(
                result?.records[0]?.get("result"),
              ).getProperties()
            : null;
          return project;
        },
        getProjectsByCategory: async function (category: string) {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = parallel")
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
            }).return(`
            project {
                .*,
                orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId]
            }
          `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record =>
            new ProjectMoreInfoEntity(record.get("project")).getProperties(),
          );
        },
        getProjectCompetitors: async function (
          id: string,
          ecosystem: string | undefined,
        ) {
          const params = new BindParam({ id, ecosystem: ecosystem ?? null });
          const query = new QueryBuilder(params)
            .raw("CYPHER runtime = parallel")
            .match({
              related: [
                {
                  label: "Project",
                  where: {
                    id: id,
                  },
                },
                { name: "HAS_CATEGORY", direction: "out" },
                {
                  label: "ProjectCategory",
                  identifier: "category",
                },
              ],
            })
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                },
                { name: "HAS_CATEGORY", direction: "out" },
                {
                  identifier: "category",
                },
              ],
            })
            .where(
              "CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((project)<-[:HAS_PROJECT]-(:Organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {name: $ecosystem})) END",
            )
            .raw("AND project.id <> $id")
            .raw(
              `
              OPTIONAL MATCH (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
              OPTIONAL MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
              WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
              OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(other:Tag)--(:PreferredDesignation)
              WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS tag, structured_jobpost, project
              OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(other:Tag)
              WITH apoc.coll.toSet(COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END)) AS tags, structured_jobpost, project
              WITH apoc.coll.toSet(COLLECT(structured_jobpost {
                  id: structured_jobpost.id,
                  url: structured_jobpost.url,
                  title: structured_jobpost.title,
                  access: structured_jobpost.access,
                  salary: structured_jobpost.salary,
                  culture: structured_jobpost.culture,
                  location: structured_jobpost.location,
                  summary: structured_jobpost.summary,
                  benefits: structured_jobpost.benefits,
                  shortUUID: structured_jobpost.shortUUID,
                  seniority: structured_jobpost.seniority,
                  description: structured_jobpost.description,
                  requirements: structured_jobpost.requirements,
                  paysInCrypto: structured_jobpost.paysInCrypto,
                  minimumSalary: structured_jobpost.minimumSalary,
                  maximumSalary: structured_jobpost.maximumSalary,
                  salaryCurrency: structured_jobpost.salaryCurrency,
                  onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
                  responsibilities: structured_jobpost.responsibilities,
                  featured: structured_jobpost.featured,
                  featureStartDate: structured_jobpost.featureStartDate,
                  featureEndDate: structured_jobpost.featureEndDate,
                  timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
                  offersTokenAllocation: structured_jobpost.offersTokenAllocation,
                  classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                  commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                  locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
                  tags: apoc.coll.toSet(tags)
              })) AS jobs, project
            `,
            )
            .return(
              `
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }],
                  jobs: jobs,
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ]
                } as result
            `,
            );
          const result = await query.run(neogma.queryRunner);
          const projects: ProjectWithRelations[] = result?.records?.map(
            record => record.get("result") as ProjectWithRelations,
          );
          return projects;
        },
        getProjectById: async function (id: string) {
          const query = new QueryBuilder()
            .raw("CYPHER runtime = pipelined")
            .match({
              related: [
                {
                  label: "Project",
                  identifier: "project",
                  where: { id: id },
                },
              ],
            }).return(`
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                  orgNames: [(org)-[:HAS_PROJECT]->(project) | org.name],
                  discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  ecosystems: [
                    (organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem: OrganizationEcosystem) | ecosystem.name
                  ],
                  aliases: [
                    (project)-[:HAS_PROJECT_ALIAS]->(alias: ProjectAlias) | alias.name
                  ],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ],
                  ecosystems: [
                    (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }],
                  jobsites: [
                    (project)-[:HAS_JOBSITE]->(jobsite:Jobsite) | jobsite {
                      id: jobsite.id,
                      url: jobsite.url,
                      type: jobsite.type
                    }
                  ],
                  detectedJobsites: [
                    (project)-[:HAS_JOBSITE]->(jobsite:DetectedJobsite) | jobsite {
                      id: jobsite.id,
                      url: jobsite.url,
                      type: jobsite.type
                    }
                  ],
                  repos: [
                    (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                  ]
              }
            `);
          const result = await query.run(neogma.queryRunner);
          return result?.records[0]?.get("project")
            ? (result?.records[0]?.get("project") as ProjectWithRelations & {
                orgNames: string[];
                ecosystems: string[];
              })
            : null;
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
            .raw("WHERE project.name =~ $query").return(`
              project {
                  .*,
                  orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId]
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
