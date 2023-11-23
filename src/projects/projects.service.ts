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
import { Neogma } from "neogma";
import { ProjectProps } from "src/shared/models";
import { UpdateProjectInput } from "./dto/update-project.input";
import { CreateProjectInput } from "./dto/create-project.input";
import NotFoundError from "src/shared/errors/not-found-error";
import { LinkJobsToProjectInput } from "./dto/link-jobs-to-project.dto";
import { LinkReposToProjectInput } from "./dto/link-repos-to-project.dto";
import { randomUUID } from "crypto";
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
          (project?.chains
            ?.map(x => normalizeString(x.name))
            .filter(x => chainFilterList.filter(y => x === y).length > 0) ??
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
          return p1.monthlyVolume;
        case "monthlyFees":
          return p1.monthlyFees;
        case "monthlyRevenue":
          return p1.monthlyRevenue;
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
              maxTvl: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.tvl]),
              minTvl: apoc.coll.min([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.tvl]),
              minMonthlyVolume: apoc.coll.min([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyVolume]),
              maxMonthlyVolume: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyVolume]),
              minMonthlyFees: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyFees]),
              maxMonthlyFees: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyFees]),
              minMonthlyRevenue: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyRevenue]),
              maxMonthlyRevenue: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyRevenue]),
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
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (p:Project {name: $name})
        RETURN p
      `,
      { name },
    );
    return res.records.length
      ? new ProjectEntity(res.records[0].get("p"))
      : undefined;
  }

  async findByDefiLlamaId(defiLlamaId: string): Promise<ProjectEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (p:Project {name: $defiLlamaId})
        RETURN p
      `,
      { defiLlamaId },
    );
    return res.records.length
      ? new ProjectEntity(res.records[0].get("p"))
      : undefined;
  }

  async findAll(): Promise<ProjectEntity[] | null> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (p:Project)
          RETURN p
        `,
      )
      .then(res =>
        res.records.length
          ? res.records.map(record => {
              return new ProjectEntity(record.get("p"));
            })
          : undefined,
      );
  }

  async create(project: CreateProjectInput): Promise<ProjectEntity> {
    const {
      website,
      telegram,
      twitter,
      discord,
      github,
      docs,
      category,
      ...props
    } = project;
    try {
      const projectNode = await this.models.Projects.createOne(
        {
          id: randomUUID(),
          description: props.description,
          name: props.name,
          orgId: props.orgId,
          isMainnet: props.isMainnet,
          logo: props.logo,
          tokenSymbol: props.tokenSymbol,
          tokenAddress: props.tokenAddress,
          createdTimestamp: new Date().getTime(),
          category: {
            properties: [
              {
                id: randomUUID(),
                name: category,
              },
            ],
            propertiesMergeConfig: {
              nodes: true,
            },
          },
          docsite: {
            properties: [
              {
                id: randomUUID(),
                url: docs,
              },
            ],
          },
          discord: {
            properties: [
              {
                id: randomUUID(),
                invite: discord,
              },
            ],
          },
          twitter: {
            properties: [
              {
                id: randomUUID(),
                username: twitter,
              },
            ],
          },
          telegram: {
            properties: [
              {
                id: randomUUID(),
                username: telegram,
              },
            ],
          },
          github: {
            properties: [
              {
                id: randomUUID(),
                login: github,
              },
            ],
          },
          website: {
            properties: [
              {
                id: randomUUID(),
                url: website,
              },
            ],
          },
        },
        { merge: true },
      );
      return new ProjectEntity(instanceToNode(projectNode));
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
    const {
      website,
      telegram,
      twitter,
      discord,
      github,
      docs,
      category,
      ...props
    } = project;
    try {
      const projectNode = await this.models.Projects.update(
        {
          description: props.description,
          name: props.name,
          orgId: props.orgId,
          isMainnet: props.isMainnet,
          logo: props.logo,
          tokenSymbol: props.tokenSymbol,
          tokenAddress: props.tokenAddress,
          updatedTimestamp: new Date().getTime(),
        },
        { where: { id }, return: true },
      );
      await this.models.Projects.updateRelationship(
        { invite: discord },
        { alias: "discord", where: { source: { id } } },
      );
      await this.models.Projects.updateRelationship(
        { name: category },
        { alias: "category", where: { source: { id } } },
      );
      await this.models.Projects.updateRelationship(
        { url: docs },
        { alias: "docsite", where: { source: { id } } },
      );
      await this.models.Projects.updateRelationship(
        { username: twitter },
        { alias: "twitter", where: { source: { id } } },
      );
      await this.models.Projects.updateRelationship(
        { username: telegram },
        { alias: "telegram", where: { source: { id } } },
      );
      await this.models.Projects.updateRelationship(
        { url: website },
        { alias: "website", where: { source: { id } } },
      );
      await this.models.Projects.updateRelationship(
        { login: github },
        { alias: "github", where: { source: { id } } },
      );
      return new ProjectEntity(instanceToNode(projectNode[0][0]));
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
              github, telegram, twitter, website
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
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (p:Project {id: $projectId})-[:HAS_CATEGORY]->(c:ProjectCategory {id: $projectCategoryId}) ) AS result
      `,
      { projectId, projectCategoryId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async relateToCategory(
    projectId: string,
    projectCategoryId: string,
  ): Promise<unknown> {
    const res = await this.neogma.queryRunner.run(
      `
        MERGE (p:Project {id: $projectId})-[r:HAS_CATEGORY]->(c:ProjectCategory {id: $projectCategoryId})
        SET r.timestamp = timestamp()

        RETURN p {
          .*,
        } AS project
        `,
      { projectId, projectCategoryId },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between Project ${projectId} to Project Category ${projectCategoryId}`,
      );
    }

    const [first] = res.records;
    const project = first.get("project");
    return new ProjectWithRelations(project);
  }

  async linkJobsToProject(
    dto: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (project: Project {id: $projectId})
          UNWIND $jobs AS shortUUID
          MATCH (job:StructuredJobpost {shortUUID: shortUUID})
          MERGE (project)-[:HAS_JOB]->(job)
        `,
        { ...dto },
      );
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
      await this.neogma.queryRunner.run(
        `
          MATCH (project: Project {id: $projectId})
          UNWIND $repos AS name
          MATCH (repo:GithubRepository {name: name})
          MERGE (project)-[:HAS_REPOSITORY]->(repo)
        `,
        { ...dto },
      );
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
      await this.neogma.queryRunner.run(
        `
          MATCH (project: Project {id: $projectId})
          UNWIND $jobs AS shortUUID
          MATCH (project)-[r:HAS_JOB]->(:StructuredJobpost {shortUUID: shortUUID})
          DELETE r
        `,
        { ...dto },
      );
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
      await this.neogma.queryRunner.run(
        `
          MATCH (project: Project {id: $projectId})
          UNWIND $repos AS name
          MATCH (project)-[r:HAS_REPOSITORY]->(:GithubRepository {name: name})
          DELETE r
        `,
        { ...dto },
      );
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
