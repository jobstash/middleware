import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import axios from "axios";
import { createNewSortInstance } from "fast-sort";
import { omit } from "lodash";
import { Neogma, Op } from "neogma";
import { InjectConnection } from "nest-neogma";
import { Auth0Service } from "src/auth0/auth0.service";
import { ModelService } from "src/model/model.service";
import {
  ensureProtocol,
  instanceToNode,
  isValidUrl,
  nonZeroOrNull,
  notStringOrNull,
  paginate,
  slugify,
  toAbsoluteURL,
} from "src/shared/helpers";
import { ProjectProps } from "src/shared/models";
import {
  Investor,
  Jobsite,
  PaginatedData,
  Project,
  ProjectCompetitorListResultEntity,
  ProjectDetailsEntity,
  ProjectDetailsResult,
  ProjectEntity,
  ProjectFilterConfigs,
  ProjectFilterConfigsEntity,
  ProjectListResult,
  ProjectListResultEntity,
  ProjectMoreInfoEntity,
  ProjectWithRelations,
  ProjectWithRelationsEntity,
  RawProjectWebsite,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ActivateProjectJobsiteInput } from "./dto/activate-project-jobsites.input";
import { AddProjectByUrlInput } from "./dto/add-project-by-url.input";
import { CreateProjectMetricsInput } from "./dto/create-project-metrics.input";
import { CreateProjectInput } from "./dto/create-project.input";
import { LinkJobsToProjectInput } from "./dto/link-jobs-to-project.dto";
import { LinkReposToProjectInput } from "./dto/link-repos-to-project.dto";
import { ProjectListParams } from "./dto/project-list.input";
import { UpdateProjectJobsitesInput } from "./dto/update-project-jobsites.input";
import { UpdateProjectInput } from "./dto/update-project.input";
import { SearchProjectsInput } from "./dto/search-projects.input";

@Injectable()
export class ProjectsService {
  private readonly logger = new CustomLogger(ProjectsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private readonly configService: ConfigService,
    private readonly auth0Service: Auth0Service,
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
      orgNames: string[];
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
        orgNames: string[];
        communities: string[];
        aliases: string[];
        investors: Investor[];
      },
    ): boolean => {
      const isValidSearchResult =
        project.name.match(query) ||
        project.aliases.some(alias => alias.match(query));
      return (
        (!query || isValidSearchResult) &&
        (!categoryFilterList ||
          categoryFilterList.includes(slugify(project.category))) &&
        (!organizationFilterList ||
          organizationFilterList.some(x =>
            project.orgNames.map(x => slugify(x)).includes(x),
          )) &&
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
            project.chains.map(x => slugify(x.name)).includes(x),
          ) ??
            false)) &&
        (!communityFilterList ||
          project.communities.filter(community =>
            communityFilterList.includes(slugify(community)),
          ).length > 0) &&
        (!investorFilterList ||
          project.investors.filter(investor =>
            investorFilterList.includes(slugify(investor.name)),
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
    community: string | undefined,
  ): Promise<ProjectFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
            RETURN {
                maxTvl: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
                ]),
                minTvl: apoc.coll.min([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
                ]),
                minMonthlyVolume: apoc.coll.min([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
                ]),
                maxMonthlyVolume: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
                ]),
                minMonthlyFees: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
                ]),
                maxMonthlyFees: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
                ]),
                minMonthlyRevenue: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
                ]),
                maxMonthlyRevenue: apoc.coll.max([
                  (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
                ]),
                investors: apoc.coll.toSet([
                  (org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | investor.name
                ]),
                communities: apoc.coll.toSet([
                  (org: Organization)-[:IS_MEMBER_OF_COMMUNITY]->(community: OrganizationCommunity)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | community.name
                ]),
                ecosystems: apoc.coll.toSet([
                  (org: Organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem: Ecosystem)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | ecosystem.name
                ]),
                categories: apoc.coll.toSet([
                  (org)-[:HAS_PROJECT|HAS_CATEGORY*2]->(category: ProjectCategory)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | category.name
                ]),
                chains: apoc.coll.toSet([
                  (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                  AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | chain.name
                ]),
                organizations: apoc.coll.toSet([
                  (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                  WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END | org.name
                ])
            } as res
          `,
          { community: community ?? null },
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
    community: string | undefined,
  ): Promise<ProjectDetailsResult | null> {
    try {
      const details = await this.models.Projects.getProjectDetailsById(id);
      if (community) {
        return details?.organizations
          .flatMap(x => x.community)
          .includes(community)
          ? details
          : undefined;
      } else {
        return details;
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
    community: string | undefined,
  ): Promise<ProjectDetailsResult | null> {
    try {
      const details = await this.models.Projects.getProjectDetailsBySlug(slug);
      const result = details
        ? new ProjectDetailsEntity(details).getProperties()
        : undefined;
      if (community) {
        return result?.organizations
          .flatMap(x => x.community)
          .includes(community)
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
      const projects = await this.models.Projects.getAllProjectsData();
      return paginate(
        page,
        limit,
        projects.map(project => ({
          ...new ProjectWithRelationsEntity({
            ...project,
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
      );
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
        .filter(project => project.orgIds.includes(id))
        .map(project => ({
          id: project.id,
          name: project.name,
          orgIds: project.orgIds,
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

  async getProjects(): Promise<
    Omit<
      ProjectWithRelations,
      | "hacks"
      | "audits"
      | "chains"
      | "ecosystems"
      | "jobs"
      | "investors"
      | "repos"
      | "communities"
    >[]
  > {
    try {
      const projects = await this.models.Projects.getProjectsData();
      return projects.map(x =>
        omit(
          {
            ...x,
            logoUrl: notStringOrNull(x.logo),
            tokenAddress: notStringOrNull(x.tokenAddress),
            defiLlamaId: notStringOrNull(x.defiLlamaId),
            defiLlamaSlug: notStringOrNull(x.defiLlamaSlug),
            defiLlamaParent: notStringOrNull(x.defiLlamaParent),
            createdTimestamp: nonZeroOrNull(x.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(x.updatedTimestamp),
          },
          [
            "hacks",
            "audits",
            "chains",
            "ecosystems",
            "jobs",
            "repos",
            "communities",
          ],
        ),
      );
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
    community: string | undefined,
  ): Promise<ProjectListResult[]> {
    try {
      return (
        await this.models.Projects.getProjectCompetitors(id, community)
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

  async searchProjects(
    params: SearchProjectsInput,
    community: string | undefined,
  ): Promise<PaginatedData<ProjectListResult>> {
    try {
      const {
        categories: categoryFilterList,
        chains: chainFilterList,
        investors: investorFilterList,
        tags: tagFilterList,
        page: page = 1,
        limit: limit = 20,
      } = params;
      const communityFilterList = community ? [community] : null;
      const all = await this.models.Projects.getProjectsData();

      const projectFilters = (
        project: ProjectWithRelations & {
          orgNames: string[];
          communities: string[];
          aliases: string[];
          investors: Investor[];
        },
      ): boolean => {
        return (
          (!tagFilterList ||
            (tagFilterList.find(x =>
              project.jobs
                .flatMap(x => x.tags)
                .map(x => slugify(x.name))
                .includes(x),
            ) ??
              false)) &&
          (!categoryFilterList ||
            categoryFilterList.includes(slugify(project.category))) &&
          (!chainFilterList ||
            chainFilterList.some(x =>
              project.chains.map(x => slugify(x.name)).includes(x),
            )) &&
          (!communityFilterList ||
            project.communities.filter(community =>
              communityFilterList.includes(slugify(community)),
            ).length > 0) &&
          (!investorFilterList ||
            project.investors.filter(investor =>
              investorFilterList.includes(slugify(investor.name)),
            ).length > 0)
        );
      };
      const filtered = all
        .filter(projectFilters)
        .map(x => new ProjectListResultEntity(x).getProperties());

      const naturalSort = createNewSortInstance({
        comparer: new Intl.Collator(undefined, {
          numeric: true,
          sensitivity: "base",
        }).compare,
        inPlaceSorting: true,
      });

      return paginate<ProjectListResult>(
        page,
        limit,
        naturalSort<ProjectListResult>(filtered).asc(x => x.name),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::searchProjects ${err.message}`);
      return undefined;
    }
  }

  async searchAllProjects(query: string): Promise<ProjectProps[]> {
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

  async getProjectById(
    id: string,
  ): Promise<
    Omit<
      ProjectWithRelations,
      | "hacks"
      | "audits"
      | "chains"
      | "ecosystems"
      | "jobs"
      | "repos"
      | "communities"
    >
  > {
    try {
      const res = await this.models.Projects.getProjectById(id);
      if (res) {
        return omit(
          {
            ...res,
            logoUrl: notStringOrNull(res.logo),
            category: notStringOrNull(res.category),
            description: notStringOrNull(res.description),
            tokenAddress: notStringOrNull(res.tokenAddress),
            defiLlamaId: notStringOrNull(res.defiLlamaId),
            defiLlamaSlug: notStringOrNull(res.defiLlamaSlug),
            defiLlamaParent: notStringOrNull(res.defiLlamaParent),
            createdTimestamp: nonZeroOrNull(res.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(res.updatedTimestamp),
          },
          [
            "hacks",
            "audits",
            "chains",
            "ecosystems",
            "jobs",
            "repos",
            "communities",
          ],
        );
      } else {
        return undefined;
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
          normalizedName: slugify(project.name),
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

  async addProjectByUrl(
    dto: AddProjectByUrlInput,
  ): Promise<ResponseWithNoData> {
    try {
      const url = this.configService.get<string>("ETL_DOMAIN");
      const authToken = await this.auth0Service.getETLToken();
      const response2 = await axios.get(
        `${url}/project-importer/import-project-by-url?url=${dto.url}&name=${
          dto.name
        }&orgId=${dto.orgId ?? ""}&defiLlamaSlug=${dto.defiLlamaSlug ?? ""}`,
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
          },
        },
      );
      if ([200, 201, 202].includes(response2.status)) {
        return {
          success: true,
          message: "Project queued for import successfully",
        };
      } else {
        this.logger.warn(
          `Error queueing project ${dto} for import: ${response2.data}`,
        );
        return {
          success: false,
          message: "Error adding project",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "external-api-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::addProjectByUrl ${err.message}`);
      return {
        success: false,
        message: `Error adding project by url`,
      };
    }
  }

  async findIdByWebsite(
    domain: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      if (ensureProtocol(domain).every(isValidUrl)) {
        try {
          ensureProtocol(domain).map(x => new URL(toAbsoluteURL(x)));
        } catch (err) {
          return {
            success: false,
            message: "Invalid url",
          };
        }
        const projects = await this.neogma.queryRunner.run(
          `
            MATCH (project:Project)-[:HAS_WEBSITE]->(website:Website)
            UNWIND $domains as domain
            WITH project, domain, website
            WHERE apoc.data.url(website.url).host CONTAINS domain OR website.url CONTAINS domain OR domain CONTAINS website.url
            RETURN project.id as id
          `,
          {
            domains: ensureProtocol(domain).map(x => toAbsoluteURL(x)),
          },
        );
        const result = projects.records.length
          ? (projects?.records[0]?.get("id") as string)
          : undefined;

        return {
          success: result ? true : false,
          message: result
            ? "Retrieved project id successfully"
            : "No project found",
          data: result,
        };
      } else {
        return {
          success: false,
          message: "Invalid url",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ProjectsService::findIdByWebsite ${err.message}`);
      return {
        success: false,
        message: "Error finding project id by website",
      };
    }
  }

  async update(
    id: string,
    project: Omit<UpdateProjectInput, "jobsites" | "detectedJobsites">,
  ): Promise<ProjectMoreInfoEntity> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (project:Project {id: $id})
          
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

          WITH project
          OPTIONAL MATCH (project)-[r:HAS_CATEGORY]->(:ProjectCategory)
          DETACH DELETE r
          
          WITH project
          MERGE (project)-[:HAS_CATEGORY]->(:ProjectCategory {name: $category})

          RETURN project { .* } as project
        `,
        {
          ...project,
          id,
          normalizedName: slugify(project.name),
          description: project.description ?? null,
        },
      );

      await this.neogma.queryRunner.run(
        `
        MATCH (project:Project {id: $id})
        OPTIONAL MATCH (project)-[:HAS_WEBSITE]->(website:Website)
        OPTIONAL MATCH (project)-[:HAS_DISCORD]->(discord:Discord)
        OPTIONAL MATCH (project)-[:HAS_DOCSITE]->(docsite:DocSite)
        OPTIONAL MATCH (project)-[:HAS_TELEGRAM]->(telegram:Telegram)
        OPTIONAL MATCH (project)-[r:HAS_GITHUB]->(github:GithubOrganization)
        OPTIONAL MATCH (project)-[:HAS_TWITTER]->(twitter:Twitter)
        DETACH DELETE website, discord, docsite, telegram, r, twitter
      `,
        { id },
      );

      if (project?.website) {
        await this.neogma.queryRunner.run(
          `
          MATCH (project:Project {id: $id})
          MERGE (project)-[:HAS_WEBSITE]->(website:Website { url: $website })
          ON CREATE SET
            website.id = randomUUID(),
            website.createdTimestamp = timestamp()
          ON MATCH SET
            website.updatedTimestamp = timestamp()
        `,
          {
            ...project,
            id,
            website: project?.website,
          },
        );
      }

      if (project.discord) {
        await this.neogma.queryRunner.run(
          `
          MATCH (project:Project {id: $id})
          MERGE (project)-[:HAS_DISCORD]->(discord:Discord { invite: $discord })
          ON CREATE SET
            discord.id = randomUUID(),
            discord.createdTimestamp = timestamp()
          ON MATCH SET
            discord.updatedTimestamp = timestamp()
        `,
          {
            ...project,
            id,
            discord: project.discord,
          },
        );
      }

      if (project.docs) {
        await this.neogma.queryRunner.run(
          `
          MATCH (project:Project {id: $id})
          MERGE (project)-[:HAS_DOCSITE]->(docsite:DocSite { url: $docs })
          ON CREATE SET
            docsite.id = randomUUID(),
            docsite.createdTimestamp = timestamp()
          ON MATCH SET
            docsite.updatedTimestamp = timestamp()
        `,
          {
            ...project,
            id,
            docs: project.docs,
          },
        );
      }

      if (project.telegram) {
        await this.neogma.queryRunner.run(
          `
          MATCH (project:Project {id: $id})
          MERGE (project)-[:HAS_TELEGRAM]->(telegram:Telegram { username: $telegram })
          ON CREATE SET
            telegram.id = randomUUID(),
            telegram.createdTimestamp = timestamp()
          ON MATCH SET
            telegram.updatedTimestamp = timestamp()
        `,
          {
            ...project,
            id,
            telegram: project.telegram,
          },
        );
      }

      if (project.github) {
        await this.neogma.queryRunner.run(
          `
          MATCH (project:Project {id: $id})
          MERGE (project)-[:HAS_GITHUB]->(github:GithubOrganization { login: $github })
          ON CREATE SET
            github.id = randomUUID(),
            github.createdTimestamp = timestamp()
          ON MATCH SET
            github.updatedTimestamp = timestamp()
        `,
          {
            ...project,
            id,
            github: project.github,
          },
        );
      }

      if (project.twitter) {
        await this.neogma.queryRunner.run(
          `
          MATCH (project:Project {id: $id})
          MERGE (project)-[:HAS_TWITTER]->(twitter:Twitter { username: $twitter })
          ON CREATE SET
            twitter.id = randomUUID(),
            twitter.createdTimestamp = timestamp()
          ON MATCH SET
            twitter.updatedTimestamp = timestamp()
        `,
          {
            ...project,
            id,
            twitter: project.twitter,
          },
        );
      }
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

  async activateProjectJobsites(
    dto: ActivateProjectJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (:Project {id: $id})-[:HAS_JOBSITE]->(jobsite:DetectedJobsite WHERE jobsite.id IN $jobsiteIds)
          REMOVE jobsite:DetectedJobsite
          SET jobsite:Jobsite
          RETURN jobsite { .* } as jobsite
        `,
        {
          ...dto,
        },
      );
      const jobsites = result.records.map(
        record => record.get("jobsite") as Jobsite,
      );
      return {
        success: true,
        message: "Activated project jobsites successfully",
        data: jobsites,
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
        `ProjectsService::activateProjectJobsites ${err.message}`,
      );
      return { success: false, message: "Failed to activate project jobsites" };
    }
  }

  async updateProjectJobsites(
    dto: UpdateProjectJobsitesInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          UNWIND $jobsites as jobsite
          WITH jobsite
          WHERE jobsite.id IS NOT NULL

          OPTIONAL MATCH (j:Jobsite)
          WHERE j.id = jobsite.id AND j IS NOT NULL
          SET j.url = jobsite.url
          SET j.type = jobsite.type
        `,
        { ...dto },
      );

      return {
        success: true,
        message: "Updated project jobsites successfully",
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
        `ProjectsService::updateProjectJobsites ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to update project jobsites",
      };
    }
  }

  async updateProjectDetectedJobsites(dto: {
    id: string;
    detectedJobsites: { id: string; url: string; type: string }[];
  }): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (project:Project {id: $id})
          OPTIONAL MATCH (project)-[:HAS_JOBSITE]->(oldDetectedJobsite:DetectedJobsite)
          DETACH DELETE oldDetectedJobsite

          WITH project
          UNWIND $detectedJobsites as detectedJobsite
          WITH detectedJobsite, project
          MERGE (project)-[:HAS_JOBSITE]->(dj: DetectedJobsite { url: detectedJobsite.url, type: detectedJobsite.type })
          ON CREATE SET
            dj.id = detectedJobsite.id,
            dj.createdTimestamp = timestamp()
          ON MATCH SET
            dj.updatedTimestamp = timestamp()
        `,
        dto,
      );
      return {
        success: true,
        message: "Updated project detected jobsites successfully",
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
        `ProjectsService::updateProjectDetectedJobsites ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to update project detected jobsites",
      };
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
            OPTIONAL MATCH (project)-[:HAS_RAW_WEBSITE]->(rawWebsite)-[:HAS_RAW_WEBSITE_METADATA]->(metadata)
            OPTIONAL MATCH (project)-[:HAS_JOBSITE]->(jobsite:Jobsite|DetectedJobsite)
            DETACH DELETE audit, hack, discord, docsite,
              github, telegram, twitter, website, project, rawWebsite, metadata, jobsite
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
