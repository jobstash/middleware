import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import axios from "axios";
import { omit } from "lodash";
import { randomUUID } from "node:crypto";
import { Auth0Service } from "src/auth0/auth0.service";
import {
  ensureProtocol,
  isValidUrl,
  nonZeroOrNull,
  notStringOrNull,
  paginate,
  slugify,
  toAbsoluteURL,
} from "src/shared/helpers";
import {
  Investor,
  Jobsite,
  PaginatedData,
  Project,
  ProjectCompetitorListResult,
  ProjectCompetitorListResultEntity,
  ProjectDetailsEntity,
  ProjectDetailsResult,
  ProjectEntity,
  ProjectFilterConfigs,
  ProjectFilterConfigsEntity,
  ProjectListResult,
  ProjectListResultEntity,
  ProjectMoreInfoEntity,
  ProjectMoreInfo,
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
import { go } from "fuzzysort";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";
import { GraphRepository } from "src/postgres/graph.repository";

@Injectable()
export class ProjectsService {
  private readonly logger = new CustomLogger(ProjectsService.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly auth0Service: Auth0Service,
    private readonly searchDocuments: SearchDocumentRepository,
    private readonly graph: GraphRepository,
  ) {}

  async getProjectsListWithSearch(
    params: ProjectListParams & { ecosystemHeader?: string },
  ): Promise<PaginatedData<ProjectListResult>> {
    const postgresPage = await this.searchDocuments.searchProjects(params);
    return {
      ...postgresPage,
      data: postgresPage.data.map(payload =>
        new ProjectListResultEntity(payload).getProperties(),
      ),
    };
  }

  async getFilterConfigs(
    ecosystem: string | undefined,
  ): Promise<ProjectFilterConfigs> {
    const values = await this.searchDocuments.getProjectFilterValues(ecosystem);
    return new ProjectFilterConfigsEntity(values).getProperties();
  }

  async getProjectDetailsById(
    id: string,
    ecosystem: string | undefined,
  ): Promise<ProjectDetailsResult | null> {
    try {
      const projected = await this.searchDocuments.getProjectById(id);
      if (
        !projected ||
        (ecosystem &&
          !projected.ecosystems.map(slugify).includes(slugify(ecosystem)))
      ) {
        return undefined;
      }
      return new ProjectDetailsEntity(
        projected as ProjectDetailsResult,
      ).getProperties();
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
      const projected = await this.searchDocuments.getProjectBySlug(slug);
      if (
        !projected ||
        (ecosystem &&
          !projected.ecosystems.map(slugify).includes(slugify(ecosystem)))
      ) {
        return undefined;
      }
      return new ProjectDetailsEntity(
        projected as ProjectDetailsResult,
      ).getProperties();
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
      const projects = await this.searchDocuments.getProjectPayloads<
        ProjectWithRelations & { rawWebsite?: RawProjectWebsite | null }
      >();
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
      const projects =
        await this.searchDocuments.getProjectPayloads<ProjectWithRelations>({
          organizationId: id,
        });
      return projects.map(project => ({
        id: project.id,
        name: project.name,
        orgIds: project.orgIds,
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
      | "ecosystems"
    >[]
  > {
    try {
      const projects =
        await this.searchDocuments.getProjectPayloads<ProjectWithRelations>();
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
            "ecosystems",
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

  async getProjectsByCategory(category: string): Promise<ProjectMoreInfo[]> {
    try {
      return (
        await this.searchDocuments.getProjectPayloads<ProjectMoreInfo>({
          category,
        })
      ).map(project => new ProjectMoreInfoEntity(project).getProperties());
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
  ): Promise<ProjectCompetitorListResult[]> {
    try {
      return (
        await this.searchDocuments.getProjectCompetitorPayloads<ProjectCompetitorListResult>(
          id,
          ecosystem,
        )
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
    ecosystem: string | undefined,
  ): Promise<PaginatedData<ProjectListResult>> {
    try {
      const page = await this.searchDocuments.searchProjects({
        ...params,
        audits: params.hasAudits,
        hacks: params.hasHacks,
        token: params.hasToken,
        ecosystemHeader: ecosystem,
      });
      return {
        ...page,
        data: page.data.map(project =>
          new ProjectListResultEntity(project).getProperties(),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error("ProjectsService::searchProjects " + err.message);
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }
  }

  async searchAllProjects(query: string): Promise<ProjectMoreInfo[]> {
    try {
      return (
        await this.searchDocuments.searchProjectPayloads<ProjectMoreInfo>(query)
      ).map(project => new ProjectMoreInfoEntity(project).getProperties());
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", query);
        Sentry.captureException(err);
      });
      this.logger.error("ProjectsService::searchProjects " + err.message);
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
      | "ecosystems"
    >
  > {
    try {
      const project =
        await this.searchDocuments.getProjectById<ProjectWithRelations>(id);
      if (!project) return undefined;
      return omit(
        {
          ...project,
          logoUrl: notStringOrNull(project.logo),
          category: notStringOrNull(project.category),
          description: notStringOrNull(project.description),
          tokenAddress: notStringOrNull(project.tokenAddress),
          defiLlamaId: notStringOrNull(project.defiLlamaId),
          defiLlamaSlug: notStringOrNull(project.defiLlamaSlug),
          defiLlamaParent: notStringOrNull(project.defiLlamaParent),
          createdTimestamp: nonZeroOrNull(project.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(project.updatedTimestamp),
        },
        [
          "hacks",
          "audits",
          "chains",
          "ecosystems",
          "jobs",
          "repos",
          "ecosystems",
        ],
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
      this.logger.error("ProjectsService::getProjectById " + err.message);
      return undefined;
    }
  }

  async find(name: string): Promise<ProjectEntity | null> {
    const project = await this.graph.findNode<Record<string, unknown>>(
      "Project",
      { name },
    );
    return project ? new ProjectEntity(project.properties) : null;
  }

  async create(project: CreateProjectInput): Promise<ProjectMoreInfoEntity> {
    try {
      const id = randomUUID();
      const {
        orgId: _orgId,
        category: _category,
        website,
        discord,
        docs,
        telegram,
        github,
        twitter,
        ...base
      } = project;
      const properties = {
        ...base,
        id,
        normalizedName: slugify(project.name),
        summary: "",
        tvl: project.tvl ?? null,
        monthlyFees: project.monthlyFees ?? null,
        monthlyVolume: project.monthlyVolume ?? null,
        monthlyRevenue: project.monthlyRevenue ?? null,
        monthlyActiveUsers: project.monthlyActiveUsers ?? null,
        logo: project.logo ?? null,
        tokenAddress: project.tokenAddress ?? null,
        tokenSymbol: project.tokenSymbol ?? null,
        defiLlamaId: project.defiLlamaId ?? null,
        defiLlamaSlug: project.defiLlamaSlug ?? null,
        defiLlamaParent: project.defiLlamaParent ?? null,
        createdTimestamp: Date.now(),
        updatedTimestamp: null,
      };
      const created = await this.graph.createNode("Project", properties, id);
      await this.setProjectCategory(id, project.category);
      await Promise.all([
        this.replaceProjectLink(id, website, "HAS_WEBSITE", "Website", "url"),
        this.replaceProjectLink(
          id,
          discord,
          "HAS_DISCORD",
          "Discord",
          "invite",
        ),
        this.replaceProjectLink(id, docs, "HAS_DOCSITE", "DocSite", "url"),
        this.replaceProjectLink(
          id,
          telegram,
          "HAS_TELEGRAM",
          "Telegram",
          "username",
        ),
        this.replaceProjectLink(
          id,
          github,
          "HAS_GITHUB",
          "GithubOrganization",
          "login",
        ),
        this.replaceProjectLink(
          id,
          twitter,
          "HAS_TWITTER",
          "Twitter",
          "username",
        ),
      ]);
      return new ProjectMoreInfoEntity({
        ...created.properties,
        orgIds: [],
      } as ProjectMoreInfo);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", project);
        Sentry.captureException(err);
      });
      this.logger.error("ProjectsService::create " + err.message);
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
      if (!ensureProtocol(domain).every(isValidUrl)) {
        return { success: false, message: "Invalid url" };
      }
      try {
        ensureProtocol(domain).map(value => new URL(toAbsoluteURL(value)));
      } catch (err) {
        this.logger.error("ProjectsService::findIdByWebsite " + err.message);
        return { success: false, message: "Invalid url" };
      }
      const result = await this.searchDocuments.findProjectIdByWebsite(
        ensureProtocol(domain).map(value => toAbsoluteURL(value)),
      );
      return {
        success: Boolean(result),
        message: result
          ? "Retrieved project id successfully"
          : "No project found",
        data: result,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error("ProjectsService::findIdByWebsite " + err.message);
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
      const {
        category,
        website,
        discord,
        docs,
        telegram,
        github,
        twitter,
        ...base
      } = project;
      const [updated] = await this.graph.updateNodes<Record<string, unknown>>(
        "Project",
        { id },
        {
          ...base,
          normalizedName: slugify(project.name),
          tvl: project.tvl ?? null,
          monthlyFees: project.monthlyFees ?? null,
          monthlyVolume: project.monthlyVolume ?? null,
          monthlyRevenue: project.monthlyRevenue ?? null,
          monthlyActiveUsers: project.monthlyActiveUsers ?? null,
          description: project.description ?? null,
          logo: project.logo ?? null,
          tokenAddress: project.tokenAddress ?? null,
          tokenSymbol: project.tokenSymbol ?? null,
          defiLlamaId: project.defiLlamaId ?? null,
          defiLlamaSlug: project.defiLlamaSlug ?? null,
          defiLlamaParent: project.defiLlamaParent ?? null,
          updatedTimestamp: Date.now(),
        },
      );
      if (!updated) return undefined;
      await this.setProjectCategory(id, category);
      await Promise.all([
        this.replaceProjectLink(id, website, "HAS_WEBSITE", "Website", "url"),
        this.replaceProjectLink(
          id,
          discord,
          "HAS_DISCORD",
          "Discord",
          "invite",
        ),
        this.replaceProjectLink(id, docs, "HAS_DOCSITE", "DocSite", "url"),
        this.replaceProjectLink(
          id,
          telegram,
          "HAS_TELEGRAM",
          "Telegram",
          "username",
        ),
        this.replaceProjectLink(
          id,
          github,
          "HAS_GITHUB",
          "GithubOrganization",
          "login",
        ),
        this.replaceProjectLink(
          id,
          twitter,
          "HAS_TWITTER",
          "Twitter",
          "username",
        ),
      ]);
      const projected = await this.searchDocuments.getProjectById<
        ProjectWithRelations & ProjectMoreInfo
      >(id);
      return new ProjectMoreInfoEntity({
        ...projected,
        ...updated.properties,
        orgIds: projected?.orgIds ?? [],
        summary: projected?.summary ?? String(updated.properties.summary ?? ""),
        description:
          projected?.description ??
          (updated.properties.description as string | null) ??
          null,
      } as unknown as ProjectMoreInfo);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", project);
        Sentry.captureException(err);
      });
      this.logger.error("ProjectsService::update " + err.message);
      return undefined;
    }
  }

  async activateProjectJobsites(
    dto: ActivateProjectJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite[]>> {
    try {
      const jobsites = (
        await this.graph.relabelRelatedNodes<Jobsite>({
          sourceLabel: "Project",
          sourceWhere: { id: dto.id },
          relationshipType: "HAS_JOBSITE",
          targetLabel: "DetectedJobsite",
          targetProperty: "id",
          targetValues: dto.jobsiteIds,
          newLabel: "Jobsite",
        })
      ).map(jobsite => jobsite.properties);
      return {
        success: true,
        message: "Activated project jobsites successfully",
        data: jobsites,
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "ProjectsService::activateProjectJobsites " + err.message,
      );
      return { success: false, message: "Failed to activate project jobsites" };
    }
  }

  async updateProjectJobsites(
    dto: UpdateProjectJobsitesInput,
  ): Promise<ResponseWithNoData> {
    try {
      const related = await this.graph.findRelatedNodes<Jobsite>({
        sourceLabel: "Project",
        sourceWhere: { id: dto.id },
        relationshipType: "HAS_JOBSITE",
        targetLabel: "Jobsite",
      });
      const relatedIds = new Set(related.map(node => node.properties.id));
      await this.graph.updateNodesFromPatches<Jobsite>({
        label: "Jobsite",
        identityProperty: "id",
        patches: dto.jobsites
          .filter(jobsite => relatedIds.has(jobsite.id))
          .map(jobsite => ({
            identity: jobsite.id,
            patch: { url: jobsite.url, type: jobsite.type },
          })),
      });
      return {
        success: true,
        message: "Updated project jobsites successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "ProjectsService::updateProjectJobsites " + err.message,
      );
      return { success: false, message: "Failed to update project jobsites" };
    }
  }

  async updateProjectDetectedJobsites(dto: {
    id: string;
    detectedJobsites: { id: string; url: string; type: string }[];
  }): Promise<ResponseWithNoData> {
    try {
      const now = Date.now();
      await this.graph.replaceOwnedRelatedNodes({
        sourceLabel: "Project",
        sourceWhere: { id: dto.id },
        relationshipType: "HAS_JOBSITE",
        targetLabel: "DetectedJobsite",
        nodeKeyProperty: "id",
        nodes: dto.detectedJobsites.map(jobsite => ({
          ...jobsite,
          createdTimestamp: now,
          updatedTimestamp: now,
        })),
      });
      return {
        success: true,
        message: "Updated project detected jobsites successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "ProjectsService::updateProjectDetectedJobsites " + err.message,
      );
      return {
        success: false,
        message: "Failed to update project detected jobsites",
      };
    }
  }

  async delete(id: string): Promise<ResponseWithNoData> {
    try {
      await this.graph.deleteNodeWithOwnedDescendants({
        rootLabel: "Project",
        rootWhere: { id },
        relationshipTypes: [
          "HAS_AUDIT",
          "HAS_HACK",
          "HAS_DISCORD",
          "HAS_DOCSITE",
          "HAS_GITHUB",
          "HAS_TELEGRAM",
          "HAS_TWITTER",
          "HAS_WEBSITE",
          "HAS_RAW_WEBSITE",
          "HAS_RAW_WEBSITE_METADATA",
          "HAS_JOBSITE",
        ],
        ownedLabels: [
          "Audit",
          "Hack",
          "Discord",
          "DocSite",
          "GithubOrganization",
          "Github",
          "Telegram",
          "Twitter",
          "Website",
          "RawWebsite",
          "RawWebsiteMetadata",
          "Jobsite",
          "DetectedJobsite",
        ],
      });
      return {
        success: true,
        message: "Project deleted successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("ProjectsService::delete " + err.message);
      return { success: false, message: "Failed delete project" };
    }
  }

  async updateMetrics(
    id: string,
    metrics: CreateProjectMetricsInput,
  ): Promise<ProjectMoreInfoEntity> {
    try {
      const [updated] = await this.graph.updateNodes<Record<string, unknown>>(
        "Project",
        { id },
        { ...metrics, updatedTimestamp: Date.now() },
      );
      if (!updated) return undefined;
      const projected = await this.searchDocuments.getProjectById<
        ProjectWithRelations & ProjectMoreInfo
      >(id);
      return new ProjectMoreInfoEntity({
        ...projected,
        ...updated.properties,
        orgIds: projected?.orgIds ?? [],
        summary: projected?.summary ?? String(updated.properties.summary ?? ""),
        description:
          projected?.description ??
          (updated.properties.description as string | null) ??
          null,
      } as unknown as ProjectMoreInfo);
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("ProjectsService::updateMetrics " + err.message);
      return undefined;
    }
  }

  async deleteMetrics(id: string): Promise<ResponseWithNoData> {
    try {
      await this.graph.updateNodes<Record<string, unknown>>(
        "Project",
        { id },
        {
          monthlyFees: null,
          monthlyVolume: null,
          monthlyRevenue: null,
          monthlyActiveUsers: null,
          updatedTimestamp: Date.now(),
        },
      );
      return {
        success: true,
        message: "Project metrics deleted successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("ProjectsService::deleteMetrics " + err.message);
      return undefined;
    }
  }

  async hasRelationshipToCategory(
    projectId: string,
    projectCategoryId: string,
  ): Promise<boolean> {
    return this.graph.hasRelationship({
      sourceLabel: "Project",
      sourceWhere: { id: projectId },
      type: "HAS_CATEGORY",
      targetLabel: "ProjectCategory",
      targetWhere: { id: projectCategoryId },
    });
  }

  async relateToCategory(
    projectId: string,
    projectCategoryId: string,
  ): Promise<boolean> {
    const related = await this.graph.setRelationshipsToNodes({
      sourceLabel: "Project",
      sourceWhere: { id: projectId },
      type: "HAS_CATEGORY",
      targetLabel: "ProjectCategory",
      targetProperty: "id",
      targetValues: [projectCategoryId],
      replace: false,
    });
    return related.length === 1;
  }

  async linkJobsToProject(
    dto: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.setRelationshipsToNodes({
        sourceLabel: "Project",
        sourceWhere: { id: dto.projectId },
        type: "HAS_JOB",
        targetLabel: "StructuredJobpost",
        targetProperty: "shortUUID",
        targetValues: dto.jobs,
        replace: false,
      });
      return { success: true, message: "Jobs linked to project successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("ProjectsService::linkJobsToProject " + err.message);
      return { success: false, message: "Failed to link jobs to project" };
    }
  }

  async linkReposToProject(
    dto: LinkReposToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.setRelationshipsToNodes({
        sourceLabel: "Project",
        sourceWhere: { id: dto.projectId },
        type: "HAS_REPOSITORY",
        targetLabel: "Repository",
        targetProperty: "fullName",
        targetValues: dto.repos,
        replace: false,
      });
      return { success: true, message: "Repos linked to project successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("ProjectsService::linkReposToProject " + err.message);
      return { success: false, message: "Failed to link repos to project" };
    }
  }

  async unlinkJobsFromProject(
    dto: LinkJobsToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.deleteRelationshipsToNodes({
        sourceLabel: "Project",
        sourceWhere: { id: dto.projectId },
        type: "HAS_JOB",
        targetLabel: "StructuredJobpost",
        targetProperty: "shortUUID",
        targetValues: dto.jobs,
      });
      return {
        success: true,
        message: "Jobs unlinked from project successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "ProjectsService::unlinkJobsFromProject " + err.message,
      );
      return { success: false, message: "Failed to unlink jobs from project" };
    }
  }

  async unlinkReposFromProject(
    dto: LinkReposToProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.deleteRelationshipsToNodes({
        sourceLabel: "Project",
        sourceWhere: { id: dto.projectId },
        type: "HAS_REPOSITORY",
        targetLabel: "Repository",
        targetProperty: "fullName",
        targetValues: dto.repos,
      });
      return {
        success: true,
        message: "Repos unlinked from project successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "ProjectsService::unlinkReposFromProject " + err.message,
      );
      return { success: false, message: "Failed to unlink repos from project" };
    }
  }

  private async setProjectCategory(
    projectId: string,
    categoryName: string,
  ): Promise<void> {
    let category = await this.graph.findNode<Record<string, unknown>>(
      "ProjectCategory",
      { name: categoryName },
    );
    if (!category) {
      const categoryId = randomUUID();
      category = await this.graph.createNode(
        "ProjectCategory",
        { id: categoryId, name: categoryName },
        `runtime:category:${slugify(categoryName)}`,
      );
    }
    await this.graph.setRelationshipsToNodes({
      sourceLabel: "Project",
      sourceWhere: { id: projectId },
      type: "HAS_CATEGORY",
      targetLabel: "ProjectCategory",
      targetProperty: "id",
      targetValues: [String(category.properties.id)],
      replace: true,
    });
  }

  private async replaceProjectLink(
    projectId: string,
    value: string | undefined,
    relationshipType: string,
    targetLabel: string,
    targetProperty: string,
  ): Promise<void> {
    await this.graph.replaceRelatedValueNodes({
      sourceLabel: "Project",
      sourceWhere: { id: projectId },
      type: relationshipType,
      targetLabel,
      targetProperty,
      values: value ? [value] : [],
    });
  }
}
