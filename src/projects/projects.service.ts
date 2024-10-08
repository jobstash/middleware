import { Injectable } from "@nestjs/common";
import {
  PaginatedData,
  ProjectFilterConfigs,
  ProjectFilterConfigsEntity,
  ProjectDetailsResult,
  ProjectDetailsEntity,
  Project,
  ProjectWithRelations,
  ProjectListResult,
  ProjectListResultEntity,
  ProjectEntity,
  ProjectCompetitorListResultEntity,
  ResponseWithNoData,
  ProjectMoreInfoEntity,
  ProjectWithRelationsEntity,
  RawProjectWebsite,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ProjectListParams } from "./dto/project-list.input";
import {
  instanceToNode,
  nonZeroOrNull,
  normalizeString,
  notStringOrNull,
  paginate,
} from "src/shared/helpers";
import { createNewSortInstance } from "fast-sort";
import { ModelService } from "src/model/model.service";
import { InjectConnection } from "nest-neogma";
import { Neogma, Op } from "neogma";
import { ProjectProps } from "src/shared/models";
import { UpdateProjectInput } from "./dto/update-project.input";
import { CreateProjectInput } from "./dto/create-project.input";
import { LinkJobsToProjectInput } from "./dto/link-jobs-to-project.dto";
import { LinkReposToProjectInput } from "./dto/link-repos-to-project.dto";
import { CreateProjectMetricsInput } from "./dto/create-project-metrics.input";

@Injectable()
export class ProjectsService {
  private readonly logger = new CustomLogger(ProjectsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  async getProjectsListWithSearch(
    params: ProjectListParams,
  ): Promise<PaginatedData<ProjectListResult>> {
    const paramsPassed = {
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };

    this.logger.log(JSON.stringify(paramsPassed));

    const {
      minTvl,
      maxTvl,
      minMonthlyVolume,
      maxMonthlyVolume,
      minMonthlyFees,
      maxMonthlyFees,
      minMonthlyRevenue,
      maxMonthlyRevenue,
      audits: auditFilter,
      hacks: hackFilter,
      chains: chainFilterList,
      organizations: organizationFilterList,
      investors: investorFilterList,
      categories: categoryFilterList,
      communities: communityFilterList,
      token,
      mainNet,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: (ProjectWithRelations & {
      orgName: string;
      communities: string[];
    })[] = [];

    try {
      const projects = await this.models.Projects.getProjectsData();
      for (const project of projects) {
        results.push(project);
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::getProjectsListWithSearch ${err.message}`,
      );
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const projectFilters = (
      project: ProjectWithRelations & {
        orgName: string;
        communities: string[];
        aliases: string[];
      },
    ): boolean => {
      const isValidSearchResult =
        project.name.match(query) ||
        project.aliases.some(alias => alias.match(query));
      return (
        (!query || isValidSearchResult) &&
        (!categoryFilterList ||
          categoryFilterList.includes(normalizeString(project.category))) &&
        (!organizationFilterList ||
          organizationFilterList.includes(normalizeString(project.orgName))) &&
        (mainNet === null || project.isMainnet === mainNet) &&
        (!minTvl || (project?.tvl ?? 0) >= minTvl) &&
        (!maxTvl || (project?.tvl ?? 0) < maxTvl) &&
        (!minMonthlyVolume ||
          (project?.monthlyVolume ?? 0) >= minMonthlyVolume) &&
        (!maxMonthlyVolume ||
          (project?.monthlyVolume ?? 0) < maxMonthlyVolume) &&
        (!minMonthlyFees || (project?.monthlyFees ?? 0) >= minMonthlyFees) &&
        (!maxMonthlyFees || (project?.monthlyFees ?? 0) < maxMonthlyFees) &&
        (!minMonthlyRevenue ||
          (project?.monthlyRevenue ?? 0) >= minMonthlyRevenue) &&
        (!maxMonthlyRevenue ||
          (project?.monthlyRevenue ?? 0) < maxMonthlyRevenue) &&
        (auditFilter === null ||
          (project?.audits?.length ?? 0) > 0 === auditFilter) &&
        (hackFilter === null ||
          (project?.hacks?.length ?? 0) > 0 === hackFilter) &&
        (!chainFilterList ||
          (chainFilterList.find(x =>
            project.chains.map(x => normalizeString(x.name)).includes(x),
          ) ??
            false)) &&
        (!communityFilterList ||
          project.communities.filter(community =>
            communityFilterList.includes(normalizeString(community)),
          ).length > 0) &&
        (!investorFilterList ||
          project.investors.filter(investor =>
            investorFilterList.includes(normalizeString(investor.name)),
          ).length > 0) &&
        (token === null ||
          (notStringOrNull(project.tokenAddress) !== null) === token)
      );
    };

    const filtered = results
      .filter(projectFilters)
      .map(x => new ProjectListResultEntity(x).getProperties());

    const getSortParam = (p1: ProjectListResult): number | null => {
      switch (params.orderBy) {
        case "audits":
          return p1.audits.length;
        case "hacks":
          return p1.hacks.length;
        case "chains":
          return p1.chains.length;
        case "monthlyVolume":
          return p1.monthlyVolume ?? 0;
        case "monthlyFees":
          return p1.monthlyFees ?? 0;
        case "monthlyRevenue":
          return p1.monthlyRevenue ?? 0;
        case "tvl":
          return p1.tvl ?? 0;
        default:
          return null;
      }
    };

    let final: ProjectListResult[] = [];
    const naturalSort = createNewSortInstance({
      comparer: new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
      }).compare,
      inPlaceSorting: true,
    });
    if (!order || order === "asc") {
      final = naturalSort<ProjectListResult>(filtered).asc(x =>
        orderBy ? getSortParam(x) : x.name,
      );
    } else {
      final = naturalSort<ProjectListResult>(filtered).desc(x =>
        orderBy ? getSortParam(x) : x.name,
      );
    }

    return paginate<ProjectListResult>(page, limit, final);
  }

  async getFilterConfigs(
    ecosystem: string | undefined,
  ): Promise<ProjectFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
            RETURN {
                maxTvl: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
                ]),
                minTvl: apoc.coll.min([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
                ]),
                minMonthlyVolume: apoc.coll.min([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
                ]),
                maxMonthlyVolume: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
                ]),
                minMonthlyFees: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
                ]),
                maxMonthlyFees: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
                ]),
                minMonthlyRevenue: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
                ]),
                maxMonthlyRevenue: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
                ]),
                investors: apoc.coll.toSet([
                  (org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | investor.name
                ]),
                communities: apoc.coll.toSet([
                  (org: Organization)-[:IS_MEMBER_OF_COMMUNITY]->(community: OrganizationCommunity)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | community.name
                ]),
                categories: apoc.coll.toSet([
                  (org)-[:HAS_PROJECT|HAS_CATEGORY*2]->(category: ProjectCategory)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | category.name
                ]),
                chains: apoc.coll.toSet([
                  (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | chain.name
                ]),
                organizations: apoc.coll.toSet([
                  (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END | org.name
                ])
            } as res
          `,
          { ecosystem: ecosystem ?? null },
        )
        .then(res =>
          res.records.length
            ? new ProjectFilterConfigsEntity(
                res.records[0].get("res"),
              ).getProperties()
            : undefined,
        );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::getFilterConfigs ${err.message}`);
      return undefined;
    }
  }

  async getProjectDetailsById(
    id: string,
    ecosystem: string | undefined,
  ): Promise<ProjectDetailsResult | null> {
    try {
      const details = await this.models.Projects.getProjectDetailsById(id);
      const result = details
        ? new ProjectDetailsEntity(details).getProperties()
        : undefined;
      if (ecosystem) {
        return result?.organization.community.includes(ecosystem)
          ? result
          : undefined;
      } else {
        return result;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::getProjectDetailsById ${err.message}`,
      );
      return undefined;
    }
  }

  async getProjectDetailsBySlug(
    slug: string,
    ecosystem: string | undefined,
  ): Promise<ProjectDetailsResult | null> {
    try {
      const details = await this.models.Projects.getProjectDetailsBySlug(slug);
      const result = details
        ? new ProjectDetailsEntity(details).getProperties()
        : undefined;
      if (ecosystem) {
        return result?.organization.community.includes(ecosystem)
          ? result
          : undefined;
      } else {
        return result;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", slug);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::getProjectDetailsById ${err.message}`,
      );
      return undefined;
    }
  }

  async getAllProjects(
    page: number,
    limit: number,
  ): Promise<
    PaginatedData<
      ProjectWithRelations & {
        rawWebsite: RawProjectWebsite;
      }
    >
  > {
    try {
      const projects = await this.models.Projects.getAllProjectsData(
        page,
        limit,
      );
      return {
        page: page,
        count: limit,
        total: -1,
        data: projects.map(project => ({
          ...new ProjectWithRelationsEntity({
            ...project,
            orgId: "-1",
          }).getProperties(),
          rawWebsite: project.rawWebsite
            ? {
                id: project.rawWebsite?.id,
                name: project.rawWebsite?.name,
                category: project.rawWebsite?.category,
                content: project.rawWebsite?.content,
                defiLlamaId: project.rawWebsite?.defiLlamaId,
                createdTimestamp: nonZeroOrNull(
                  project.rawWebsite?.createdTimestamp,
                ),
                url: project.rawWebsite?.url,
                metadata: project.rawWebsite?.metadata
                  ? {
                      ...project.rawWebsite?.metadata,
                      copyrightName: notStringOrNull(
                        project.rawWebsite?.metadata?.copyrightName,
                      ),
                      copyrightStart: notStringOrNull(
                        project.rawWebsite?.metadata?.copyrightStart,
                      ),
                      createdTimestamp: nonZeroOrNull(
                        project.rawWebsite?.metadata?.createdTimestamp,
                      ),
                      id: notStringOrNull(project.rawWebsite?.metadata?.id),
                      isCrypto: project.rawWebsite?.metadata?.isCrypto ?? false,
                      isEmpty: project.rawWebsite?.metadata?.isEmpty ?? false,
                      isError: project.rawWebsite?.metadata?.isError ?? false,
                      isParkedWebsite:
                        project.rawWebsite?.metadata?.isParkedWebsite ?? false,
                      secondpassCopyrightEnd: notStringOrNull(
                        project.rawWebsite?.metadata?.secondpassCopyrightEnd,
                      ),
                      secondpassCopyrightName: notStringOrNull(
                        project.rawWebsite?.metadata?.secondpassCopyrightName,
                      ),
                      secondpassCopyrightStart: notStringOrNull(
                        project.rawWebsite?.metadata?.secondpassCopyrightStart,
                      ),
                      secondpassIsActive:
                        project.rawWebsite?.metadata?.secondpassIsActive ??
                        false,
                      secondpassIsCrypto:
                        project.rawWebsite?.metadata?.secondpassIsCrypto ??
                        false,
                      secondpassIsRenamed:
                        project.rawWebsite?.metadata?.secondpassIsRenamed ??
                        false,
                      updatedTimestamp: nonZeroOrNull(
                        project.rawWebsite?.metadata?.updatedTimestamp,
                      ),
                      url: notStringOrNull(project.rawWebsite?.metadata?.url),
                    }
                  : null,
              }
            : null,
        })),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::getAllProjects ${err.message}`);
      return undefined;
    }
  }

  async getProjectsByOrgId(id: string): Promise<Project[] | null> {
    try {
      const projects = await this.models.Projects.getProjectsData();
      return projects
        .filter(project => project.orgId === id)
        .map(project => ({
          id: project.id,
          name: project.name,
          orgId: project.orgId,
          isMainnet: project.isMainnet,
          tvl: project.tvl,
          logo: project.logo,
          category: project.category,
          tokenSymbol: project.tokenSymbol,
          monthlyFees: project.monthlyFees,
          monthlyVolume: project.monthlyVolume,
          normalizedName: project.normalizedName,
          monthlyRevenue: project.monthlyRevenue,
          monthlyActiveUsers: project.monthlyActiveUsers,
        }));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::getProjectByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getProjects(): Promise<Project[]> {
    try {
      const projects = await this.models.Projects.findMany();
      return projects.map(project => project.getBaseProperties());
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::getProjects ${err.message}`);
      return undefined;
    }
  }

  async getProjectsByCategory(category: string): Promise<ProjectProps[]> {
    try {
      return this.models.Projects.getProjectsByCategory(category);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", category);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::getProjectsByCategory ${err.message}`,
      );
      return undefined;
    }
  }

  async getProjectCompetitors(
    id: string,
    ecosystem: string | undefined,
  ): Promise<ProjectListResult[]> {
    try {
      return (
        await this.models.Projects.getProjectCompetitors(id, ecosystem)
      ).map(project =>
        new ProjectCompetitorListResultEntity(project).getProperties(),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::getProjectCompetitors ${err.message}`,
      );
      return undefined;
    }
  }

  async searchProjects(query: string): Promise<ProjectProps[]> {
    try {
      return this.models.Projects.searchProjects(query);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", query);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::searchProjects ${err.message}`);
      return undefined;
    }
  }

  async getProjectById(id: string): Promise<ProjectProps | null> {
    try {
      return this.models.Projects.getProjectById(id);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::getProjectById ${err.message}`);
      return undefined;
    }
  }

  async find(name: string): Promise<ProjectEntity | null> {
    return this.models.Projects.findOne({
      where: {
        name: name,
      },
    }).then(res => (res ? new ProjectEntity(instanceToNode(res)) : null));
  }

  async create(project: CreateProjectInput): Promise<ProjectMoreInfoEntity> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CREATE (project:Project {
            id: randomUUID(),
            orgId: $orgId,
            name: $name,
            normalizedName: $normalizedName,
            tvl: $tvl,
            monthlyFees: $monthlyFees,
            monthlyVolume: $monthlyVolume,
            monthlyRevenue: $monthlyRevenue,
            monthlyActiveUsers: $monthlyActiveUsers,
            description: $description,
            logo: $logo,
            isMainnet: $isMainnet,
            tokenAddress: $tokenAddress,
            tokenSymbol: $tokenSymbol,
            defiLlamaId: $defiLlamaId,
            defiLlamaSlug: $defiLlamaSlug,
            defiLlamaParent: $defiLlamaParent,
            createdTimestamp: timestamp()
          })

          WITH project
          MATCH (cat:ProjectCategory {name: $category})
          CREATE (project)-[:HAS_CATEGORY]->(cat)
          CREATE (project)-[:HAS_DISCORD]->(discord:Discord {id: randomUUID(), invite: $discord}) 
          CREATE (project)-[:HAS_WEBSITE]->(website:Website {id: randomUUID(), url: $website}) 
          CREATE (project)-[:HAS_DOCSITE]->(docsite:DocSite {id: randomUUID(), url: $docs}) 
          CREATE (project)-[:HAS_TELEGRAM]->(telegram:Telegram {id: randomUUID(), username: $telegram}) 
          CREATE (project)-[:HAS_TWITTER]->(twitter: Twitter {id: randomUUID(), username: $twitter}) 
          CREATE (project)-[:HAS_GITHUB]->(github: Github {id: randomUUID(), login: $github})

          RETURN project { .* } as project
        `,
        {
          ...project,
          tvl: project.tvl ?? null,
          monthlyFees: project.monthlyFees ?? null,
          monthlyVolume: project.monthlyVolume ?? null,
          monthlyRevenue: project.monthlyRevenue ?? null,
          monthlyActiveUsers: project.monthlyActiveUsers ?? null,
          normalizedName: normalizeString(project.name),
        },
      );
      return new ProjectMoreInfoEntity(result?.records[0]?.get("project"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", project);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::create ${err.message}`);
      return undefined;
    }
  }

  async update(
    id: string,
    project: UpdateProjectInput,
  ): Promise<ProjectMoreInfoEntity> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (project:Project {id: $id})
          OPTIONAL MATCH (project)-[:HAS_DISCORD]->(discord:Discord) 
          OPTIONAL MATCH (project)-[:HAS_WEBSITE]->(website:Website) 
          OPTIONAL MATCH (project)-[:HAS_DOCSITE]->(docsite:DocSite) 
          OPTIONAL MATCH (project)-[:HAS_TELEGRAM]->(telegram:Telegram) 
          OPTIONAL MATCH (project)-[:HAS_TWITTER]->(twitter: Twitter) 
          OPTIONAL MATCH (project)-[:HAS_GITHUB]->(github: Github)
          
          SET project.orgId = $orgId
          SET project.name = $name
          SET project.normalizedName = $normalizedName
          SET project.tvl = $tvl
          SET project.monthlyFees = $monthlyFees
          SET project.monthlyVolume = $monthlyVolume
          SET project.monthlyRevenue = $monthlyRevenue
          SET project.monthlyActiveUsers = $monthlyActiveUsers
          SET project.description = $description
          SET project.logo = $logo
          SET project.isMainnet = $isMainnet
          SET project.tokenAddress = $tokenAddress
          SET project.tokenSymbol = $tokenSymbol
          SET project.defiLlamaId = $defiLlamaId
          SET project.defiLlamaSlug = $defiLlamaSlug
          SET project.defiLlamaParent = $defiLlamaParent
          SET project.updatedTimestamp = timestamp()
          SET discord.invite = $discord
          SET docsite.url = $docs
          SET telegram.username = $telegram
          SET twitter.username = $twitter
          SET github.login = $github

          WITH project
          OPTIONAL MATCH (project)-[r:HAS_CATEGORY]->(:ProjectCategory)
          DETACH DELETE r
          
          WITH project
          MERGE (project)-[:HAS_CATEGORY]->(:ProjectCategory {name: $category})

          RETURN project { .* } as project
        `,
        { ...project, id, normalizedName: normalizeString(project.name) },
      );
      return new ProjectMoreInfoEntity(result?.records[0]?.get("project"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", project);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::update ${err.message}`);
      return undefined;
    }
  }

  async delete(id: string): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            MATCH (project:Project { id: $id })
            OPTIONAL MATCH (project)-[:HAS_AUDIT]->(audit)
            OPTIONAL MATCH (project)-[:HAS_HACK]->(hack)
            OPTIONAL MATCH (project)-[:HAS_DISCORD]->(discord)
            OPTIONAL MATCH (project)-[:HAS_DOCSITE]->(docsite)
            OPTIONAL MATCH (project)-[:HAS_GITHUB]->(github:GithubOrganization)
            OPTIONAL MATCH (project)-[:HAS_TELEGRAM]->(telegram)
            OPTIONAL MATCH (project)-[:HAS_TWITTER]->(twitter)
            OPTIONAL MATCH (project)-[:HAS_WEBSITE]->(website)
            DETACH DELETE audit, hack, discord, docsite,
              github, telegram, twitter, website, project
        `,
        {
          id,
        },
      );
      return {
        success: true,
        message: "Project deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::delete ${err.message}`);
      return {
        success: false,
        message: "Failed delete project",
      };
    }
  }

  async updateMetrics(
    id: string,
    metrics: CreateProjectMetricsInput,
  ): Promise<ProjectMoreInfoEntity> {
    const { monthlyFees, monthlyVolume, monthlyRevenue, monthlyActiveUsers } =
      metrics;
    try {
      const projectNode = await this.models.Projects.update(
        {
          monthlyFees,
          monthlyVolume,
          monthlyRevenue,
          monthlyActiveUsers,
          updatedTimestamp: new Date().getTime(),
        },
        { where: { id }, return: true },
      );
      return new ProjectMoreInfoEntity(projectNode[0][0].getDataValues());
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", metrics);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::updateMetrics ${err.message}`);
      return undefined;
    }
  }

  async deleteMetrics(id: string): Promise<ResponseWithNoData> {
    try {
      await this.models.Projects.update(
        {
          monthlyFees: null,
          monthlyVolume: null,
          monthlyRevenue: null,
          monthlyActiveUsers: null,
          updatedTimestamp: new Date().getTime(),
        },
        { where: { id }, return: true },
      );
      return {
        success: true,
        message: "Project metrics deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::deleteMetrics ${err.message}`);
      return undefined;
    }
  }

  async hasRelationshipToCategory(
    projectId: string,
    projectCategoryId: string,
  ): Promise<boolean> {
    return (
      (
        await this.models.Projects.findRelationships({
          alias: "category",
          limit: 1,
          where: {
            source: {
              id: projectId,
            },
            target: {
              id: projectCategoryId,
            },
          },
        })
      ).length === 1
    );
  }

  async relateToCategory(
    projectId: string,
    projectCategoryId: string,
  ): Promise<boolean> {
    const result = await this.models.Projects.relateTo({
      alias: "category",
      where: {
        source: {
          id: projectId,
        },
        target: {
          id: projectCategoryId,
        },
      },
    });
    return result === 1;
  }

  async linkJobsToProject(
    dto: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.models.Projects.relateTo({
        alias: "jobs",
        where: {
          source: {
            id: dto.projectId,
          },
          target: {
            shortUUID: {
              [Op.in]: dto.jobs,
            },
          },
        },
      });
      return {
        success: true,
        message: "Jobs linked to project successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::linkJobsToProject ${err.message}`);
      return {
        success: false,
        message: "Failed to link jobs to project",
      };
    }
  }

  async linkReposToProject(
    dto: LinkReposToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.models.Projects.relateTo({
        alias: "repos",
        where: {
          source: {
            id: dto.projectId,
          },
          target: {
            fullName: {
              [Op.in]: dto.repos,
            },
          },
        },
      });
      return {
        success: true,
        message: "Repos linked to project successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::linkReposToProject ${err.message}`);
      return {
        success: false,
        message: "Failed to link repos to project",
      };
    }
  }

  async unlinkJobsFromProject(
    dto: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      for (const job of dto.jobs) {
        await this.models.Projects.deleteRelationships({
          alias: "jobs",
          where: {
            source: {
              id: dto.projectId,
            },
            target: {
              shortUUID: job,
            },
          },
        });
      }
      return {
        success: true,
        message: "Jobs unlinked from project successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::unlinkJobsFromProject ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to unlink jobs from project",
      };
    }
  }

  async unlinkReposFromProject(
    dto: LinkReposToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      for (const repo of dto.repos) {
        await this.models.Projects.deleteRelationships({
          alias: "repos",
          where: {
            source: {
              id: dto.projectId,
            },
            target: {
              fullName: repo,
            },
          },
        });
      }
      return {
        success: true,
        message: "Repos unlinked from project successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProjectsService::unlinkReposFromProject ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to unlink repos from project",
      };
    }
  }
}
