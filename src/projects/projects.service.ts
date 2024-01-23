import { Injectable } from "@nestjs/common";
import {
  PaginatedData,
  ProjectFilterConfigs,
  ProjectFilterConfigsEntity,
  ProjectDetails,
  ProjectDetailsEntity,
  Project,
  ProjectWithRelations,
  ProjectListResult,
  ProjectListResultEntity,
  ProjectEntity,
  ProjectCompetitorListResultEntity,
  ResponseWithNoData,
  ProjectMoreInfoEntity,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ProjectListParams } from "./dto/project-list.input";
import {
  instanceToNode,
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
      categories: categoryFilterList,
      token,
      mainNet,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: (ProjectWithRelations & { orgName: string })[] = [];

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
      project: ProjectWithRelations & { orgName: string },
    ): boolean => {
      return (
        (!query || project.name.match(query)) &&
        (!categoryFilterList ||
          categoryFilterList.includes(normalizeString(project.category))) &&
        (!organizationFilterList ||
          organizationFilterList.includes(normalizeString(project.orgName))) &&
        (!mainNet || project.isMainnet) &&
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
        (!auditFilter || (project?.audits.length ?? 0) > 0 === auditFilter) &&
        (!hackFilter || (project?.hacks.length ?? 0) > 0 === hackFilter) &&
        (!chainFilterList ||
          (chainFilterList.find(x =>
            project.chains.map(x => normalizeString(x.name)).includes(x),
          ) ??
            false)) &&
        (!token || notStringOrNull(project.tokenSymbol) !== null)
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

  async getFilterConfigs(): Promise<ProjectFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
          RETURN {
              maxTvl: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.tvl
              ]),
              minTvl: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.tvl
              ]),
              minMonthlyVolume: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) AND
                NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.monthlyVolume
              ]),
              maxMonthlyVolume: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.monthlyVolume
              ]),
              minMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.monthlyFees
              ]),
              maxMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.monthlyFees
              ]),
              minMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.monthlyRevenue
              ]),
              maxMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.monthlyRevenue
              ]),
              categories: apoc.coll.toSet([(org)-[:HAS_PROJECT|HAS_CATEGORY*2]->(category: ProjectCategory) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | category.name]),
              chains: apoc.coll.toSet([(org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | chain.name]),
              organizations: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.name])
          } as res
      `,
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

  async getProjectDetailsById(id: string): Promise<ProjectDetails | null> {
    try {
      const details = await this.models.Projects.getProjectDetailsById(id);
      return details
        ? new ProjectDetailsEntity(details).getProperties()
        : undefined;
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

  async getProjectCompetitors(id: string): Promise<ProjectListResult[]> {
    try {
      return (await this.models.Projects.getProjectCompetitors(id)).map(
        project =>
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

  async create(project: CreateProjectInput): Promise<ProjectEntity> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CREATE (project:Project {
            id: randomUUID(),
            orgId: $orgId,
            name: $name,
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
            defiLlamaParent: $defiLlamaParent
          })

          WITH project
          CREATE (project)-[:HAS_DISCORD]->(discord:Discord {id: randomUUID(), invite: $discord}) 
          CREATE (project)-[:HAS_WEBSITE]->(website:Website {id: randomUUID(), url: $website}) 
          CREATE (project)-[:HAS_DOCSITE]->(docsite:DocSite {id: randomUUID(), url: $docs}) 
          CREATE (project)-[:HAS_TELEGRAM]->(telegram:Telegram {id: randomUUID(), username: $telegram}) 
          CREATE (project)-[:HAS_TWITTER]->(twitter: Twitter {id: randomUUID(), username: $twitter}) 
          CREATE (project)-[:HAS_GITHUB]->(github: Github {id: randomUUID(), login: $github})

          RETURN project
        `,
        { ...project },
      );
      return new ProjectEntity(result?.records[0]?.get("project"));
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
  ): Promise<ProjectEntity> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (project:Project {id: $id})
          MATCH (project)-[:HAS_DISCORD]->(discord:Discord) 
          MATCH (project)-[:HAS_WEBSITE]->(website:Website) 
          MATCH (project)-[:HAS_DOCSITE]->(docsite:DocSite) 
          MATCH (project)-[:HAS_TELEGRAM]->(telegram:Telegram) 
          MATCH (project)-[:HAS_TWITTER]->(twitter: Twitter) 
          MATCH (project)-[:HAS_GITHUB]->(github: Github)
          
          SET project.orgId = $orgId
          SET project.name = $name
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
          SET discord.invite = $discord
          SET website.url = $website
          SET docsite.url = $docs
          SET telegram.username = $telegram
          SET twitter.username = $twitter
          SET github.login = $github

          WITH project
          MATCH (project)-[r:HAS_CATEGORY]->(:ProjectCategory)
          DETACH DELETE r
          
          WITH project
          MERGE (project)-[:HAS_CATEGORY]->(:ProjectCategory {name: $category})

          WITH project
          RETURN project
        `,
        { ...project, id },
      );
      return new ProjectEntity(result?.records[0]?.get("project"));
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
            OPTIONAL MATCH (project)-[:HAS_GITHUB]->(github)
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
      assertCreatedRelationships: 1,
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
        // assertCreatedRelationships: dto.jobs.length,
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
        // assertCreatedRelationships: dto.repos.length,
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
