import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ShortOrg,
  Repository,
  PaginatedData,
  OrgFilterConfigs,
  OrgFilterConfigsEntity,
  OrgListResult,
  OrgDetailsResultEntity,
  ResponseWithNoData,
  ResponseWithOptionalData,
  OrganizationWithLinks,
  Jobsite,
  TinyOrg,
  Organization,
  ShortOrgWithSummary,
  OrgDetailsResult,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { OrgListParams } from "./dto/org-list.input";
import {
  ensureProtocol,
  isValidUrl,
  slugify,
  toAbsoluteURL,
  toShortOrg,
  toShortOrgWithSummary,
} from "src/shared/helpers";
import {
  OrganizationEntity,
  OrganizationWithLinksEntity,
  OrgListResultEntity,
  RepositoryEntity,
} from "src/shared/entities";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import { UpdateOrgAliasesInput } from "./dto/update-organization-aliases.input";
import { UpdateOrgWebsitesInput } from "./dto/update-organization-websites.input";
import { UpdateOrgTwittersInput } from "./dto/update-organization-twitters.input";
import { UpdateOrgGithubsInput } from "./dto/update-organization-githubs.input";
import { UpdateOrgDiscordsInput } from "./dto/update-organization-discords.input";
import { UpdateOrgDocsInput } from "./dto/update-organization-docs.input";
import { UpdateOrgTelegramsInput } from "./dto/update-organization-telegrams.input";
import { UpdateOrgGrantsInput } from "./dto/update-organization-grants.input";
import { ActivateOrgJobsiteInput } from "./dto/activate-organization-jobsites.input";
import { UpdateOrgJobsitesInput } from "./dto/update-organization-jobsites.input";
import { UpdateOrgProjectInput } from "./dto/update-organization-projects.input";
import { AddOrganizationByUrlInput } from "./dto/add-organization-by-url.input";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Auth0Service } from "src/auth0/auth0.service";
import { ImportOrgJobsiteInput } from "./dto/import-organization-jobsites.input";
import { SearchOrganizationsInput } from "./dto/search-organizations.input";
import {
  EvSitemapOrganization,
  SearchDocumentRepository,
} from "src/postgres/search-document.repository";
import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";

@Injectable()
export class OrganizationsService {
  private readonly logger = new CustomLogger(OrganizationsService.name);
  constructor(
    private configService: ConfigService,
    private readonly auth0Service: Auth0Service,
    private readonly searchDocuments: SearchDocumentRepository,
    private readonly graph: GraphRepository,
    private readonly postgres: PostgresService,
  ) {}

  async getIngestionStatus(): Promise<Record<string, unknown>> {
    const [
      campaignRows,
      organizationRows,
      reviewRows,
      projectRows,
      projectStatsRows,
      unownedProjectRows,
      fundRows,
      githubRows,
    ] = await Promise.all([
      this.postgres.query<{
        campaign_key: string;
        status: string;
        total_items: string;
        counts: Record<string, number>;
        started_at: string | null;
        updated_at: string;
      }>(`
          SELECT campaign.campaign_key, campaign.status,
                 campaign.total_items::text, campaign.started_at,
                 campaign.updated_at,
                 COALESCE(jsonb_object_agg(states.status, states.count), '{}'::jsonb) AS counts
          FROM research_campaigns campaign
          LEFT JOIN LATERAL (
            SELECT item.status, count(*)::int AS count
            FROM research_campaign_items item
            WHERE item.campaign_id = campaign.id
            GROUP BY item.status
          ) states ON true
          GROUP BY campaign.id
          ORDER BY campaign.created_at DESC
          LIMIT 1
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT item.organization_node_id::text AS "organizationNodeId",
                 organization.properties ->> 'orgId' AS "orgId",
                 organization.properties ->> 'name' AS name,
                 item.website_url AS "websiteUrl", item.status,
                 item.attempt_count AS "attemptCount", item.provider, item.model,
                 item.lease_owner AS "workerId", item.started_at AS "startedAt",
                 item.updated_at AS "updatedAt", item.lease_expires_at AS "leaseExpiresAt",
                 item.last_error_code AS "lastErrorCode",
                 item.last_error_message AS "lastErrorMessage",
                 COALESCE(github.accounts, '[]'::jsonb) AS github
          FROM research_campaign_items item
          JOIN research_campaigns campaign ON campaign.id = item.campaign_id
          JOIN graph_nodes organization ON organization.id = item.organization_node_id
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object(
              'login', account.properties ->> 'login',
              'status', CASE
                WHEN queue.login IS NOT NULL AND queue.locked_at IS NOT NULL THEN 'indexing'
                WHEN queue.login IS NOT NULL AND queue.last_error IS NOT NULL THEN 'retrying'
                WHEN queue.login IS NOT NULL THEN 'queued'
                WHEN state.login IS NOT NULL THEN 'reconciled'
                ELSE 'not_indexed'
              END,
              'queueAttempts', COALESCE(queue.attempts, 0),
              'queueError', queue.last_error,
              'requestedAt', queue.requested_at,
              'reconciledAt', state.reconciled_at,
              'corpusFingerprint', state.corpus_fingerprint,
              'clickhouseCorpusRecorded', state.corpus_fingerprint IS NOT NULL
            ) ORDER BY lower(account.properties ->> 'login')) AS accounts
            FROM graph_relationships edge
            JOIN graph_nodes account
              ON account.id = edge.target_id AND account.label = 'GithubOrganization'
            LEFT JOIN github_indexer_lifecycle_queue queue
              ON queue.login = lower(account.properties ->> 'login')
            LEFT JOIN github_indexer_lifecycle_state state
              ON state.login = lower(account.properties ->> 'login')
            WHERE edge.source_id = organization.id AND edge.type = 'HAS_GITHUB'
          ) github ON true
          WHERE campaign.created_at = (SELECT max(created_at) FROM research_campaigns)
            AND item.status = 'leased'
            AND item.lease_expires_at > now()
          ORDER BY item.started_at, item.organization_node_id
          LIMIT 200
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT item.organization_node_id::text AS "organizationNodeId",
                 organization.properties ->> 'orgId' AS "orgId",
                 organization.properties ->> 'name' AS name,
                 item.website_url AS "websiteUrl", item.status,
                 item.attempt_count AS "attemptCount",
                 item.last_error_code AS "lastErrorCode",
                 item.last_error_message AS "lastErrorMessage",
                 item.started_at AS "startedAt", item.updated_at AS "updatedAt",
                 item.completed_at AS "completedAt",
                 jsonb_strip_nulls(jsonb_build_object(
                   'finalReport', result.properties -> 'finalReport',
                   'visitedPages', result.properties -> 'visitedPages',
                   'evidencePacket', result.properties -> 'evidencePacket',
                   'detectedProjects', result.properties -> 'detectedProjects',
                   'staff', result.properties -> 'staff'
                 )) AS "reviewPacket",
                 manual.review_status AS "reviewStatus",
                 manual.reviewer, manual.notes, manual.reviewed_at AS "reviewedAt"
          FROM research_campaign_items item
          JOIN research_campaigns campaign ON campaign.id = item.campaign_id
          JOIN graph_nodes organization ON organization.id = item.organization_node_id
          LEFT JOIN graph_nodes result ON result.id = item.result_node_id
          LEFT JOIN LATERAL (
            SELECT review.review_status, review.reviewer, review.notes, review.reviewed_at
            FROM research_campaign_manual_reviews review
            WHERE review.campaign_id = item.campaign_id
              AND review.organization_node_id = item.organization_node_id
            ORDER BY review.reviewed_at DESC, review.id DESC
            LIMIT 1
          ) manual ON true
          WHERE campaign.created_at = (SELECT max(created_at) FROM research_campaigns)
            AND item.status = 'needs_review'
          ORDER BY item.completed_at, item.organization_node_id
          LIMIT 100
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT entity.id::text AS "nodeId", entity.label AS "entityKind",
                 entity.properties ->> 'id' AS id,
                 entity.properties ->> 'name' AS name,
                 review.properties AS "reviewPacket"
          FROM graph_nodes entity
          JOIN graph_relationships edge
            ON edge.source_id = entity.id AND edge.type = 'HAS_ENTITY_REVIEW'
          JOIN graph_nodes review
            ON review.id = edge.target_id AND review.label = 'EntityReview'
          WHERE entity.label IN ('Project', 'ChildProjectCandidate')
            AND COALESCE(review.properties ->> 'status', 'open') = 'open'
          ORDER BY jsonb_numeric_value(review.properties, 'createdTimestamp') NULLS LAST,
                   entity.id
          LIMIT 100
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT
            count(*) FILTER (WHERE project.label = 'Project')::int AS total,
            count(*) FILTER (
              WHERE project.label = 'Project'
                AND entity_property_is_banned(project.properties)
            )::int AS banned,
            count(*) FILTER (
              WHERE project.label = 'Project'
                AND NOT entity_property_is_banned(project.properties)
                AND NOT EXISTS (
                  SELECT 1
                  FROM graph_relationships owner
                  WHERE owner.target_id = project.id
                    AND owner.type = 'HAS_PROJECT'
                )
            )::int AS unowned,
            count(*) FILTER (
              WHERE project.label = 'ChildProjectCandidate'
                AND NOT entity_property_is_banned(project.properties)
            )::int AS "detectedCandidates"
          FROM graph_nodes project
          WHERE project.label IN ('Project', 'ChildProjectCandidate')
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT project.id::text AS "nodeId",
                 project.label AS "entityKind",
                 project.properties ->> 'id' AS id,
                 project.properties ->> 'name' AS name,
                 jsonb_strip_nulls(jsonb_build_object(
                   'status', 'unowned',
                   'source', project.properties ->> 'source',
                   'website', website.url,
                   'createdTimestamp', jsonb_numeric_value(
                     project.properties,
                     'createdTimestamp'
                   )
                 )) AS "reviewPacket"
          FROM graph_nodes project
          LEFT JOIN LATERAL (
            SELECT min(related.properties ->> 'url') AS url
            FROM graph_relationships relationship
            JOIN graph_nodes related ON related.id = relationship.target_id
            WHERE relationship.source_id = project.id
              AND relationship.type = 'HAS_WEBSITE'
          ) website ON true
          WHERE project.label = 'Project'
            AND NOT entity_property_is_banned(project.properties)
            AND NOT EXISTS (
              SELECT 1
              FROM graph_relationships owner
              WHERE owner.target_id = project.id
                AND owner.type = 'HAS_PROJECT'
            )
          ORDER BY jsonb_numeric_value(
                     project.properties,
                     'createdTimestamp'
                   ) DESC NULLS LAST,
                   project.id DESC
          LIMIT 100
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT
            (SELECT count(*)::int FROM graph_nodes
             WHERE label = 'Investor'
               AND lower(COALESCE(properties ->> 'isFund', 'false'))
                   IN ('true', '1', 'yes', 'on')) AS total,
            (SELECT count(*)::int FROM graph_nodes
             WHERE label = 'CfImportRecord' AND properties ->> 'kind' = 'fund') AS checkpointed,
            (SELECT COALESCE(jsonb_object_agg(outcome, count), '{}'::jsonb)
             FROM (
               SELECT COALESCE(properties ->> 'outcome', 'unknown') AS outcome,
                      count(*)::int AS count
               FROM graph_nodes
               WHERE label = 'CfImportRecord' AND properties ->> 'kind' = 'fund'
               GROUP BY 1
             ) outcomes) AS outcomes,
            (SELECT max(jsonb_numeric_value(properties, 'importedTimestamp'))::float8
             FROM graph_nodes
             WHERE label = 'CfImportRecord' AND properties ->> 'kind' = 'fund') AS "lastImportedTimestamp"
        `),
      this.postgres.query<Record<string, unknown>>(`
          SELECT
            (SELECT count(*)::int FROM github_indexer_lifecycle_queue) AS "queueDepth",
            (SELECT count(*)::int FROM github_indexer_lifecycle_queue
             WHERE locked_at IS NOT NULL) AS "inProgress",
            (SELECT count(*)::int FROM github_indexer_lifecycle_queue
             WHERE last_error IS NOT NULL AND locked_at IS NULL) AS "retrying",
            (SELECT count(*)::int FROM github_indexer_lifecycle_state
             WHERE corpus_fingerprint IS NOT NULL) AS "reconciledCorpusFingerprints",
            requested_revision::text AS "dbtRequestedRevision",
            completed_revision::text AS "dbtCompletedRevision",
            last_error AS "dbtLastError", completed_at AS "dbtCompletedAt"
          FROM github_indexer_dbt_refresh_state
          WHERE singleton = true
        `),
    ]);

    const githubIndexerRuntime = await this.getGithubIndexerRuntimeStatus(
      organizationRows.flatMap(row => {
        const github = row.github;
        return Array.isArray(github)
          ? github.flatMap(account =>
              account && typeof account === "object" && "login" in account
                ? [String(account.login)]
                : [],
            )
          : [];
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      campaign: campaignRows[0] ?? null,
      organizations: {
        inProgress: organizationRows,
        reviewPending: reviewRows,
      },
      projects: {
        reviewPending: projectRows,
        unowned: unownedProjectRows,
        stats: projectStatsRows[0] ?? {
          total: 0,
          banned: 0,
          unowned: 0,
          detectedCandidates: 0,
        },
      },
      funds: fundRows[0] ?? { total: 0, checkpointed: 0, outcomes: {} },
      githubIndexer: githubRows[0]
        ? { ...githubRows[0], runtime: githubIndexerRuntime }
        : null,
    };
  }

  private async getGithubIndexerRuntimeStatus(
    logins: string[],
  ): Promise<Record<string, unknown> | null> {
    const url = this.configService.get<string>("GITHUB_INDEXER_STATUS_URL");
    const token = this.configService.get<string>("GITHUB_INDEXER_STATUS_TOKEN");
    if (!url || !token) return null;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { logins: [...new Set(logins)].slice(0, 200).join(",") },
        timeout: 15_000,
      });
      return response.data as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(
        `GitHub indexer observability unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  getOrgListResults = async (
    ecosystem?: string | undefined,
  ): Promise<OrgListResult[]> => {
    const payloads =
      await this.searchDocuments.getOrganizationPayloads(ecosystem);
    return payloads.map(payload =>
      new OrgListResultEntity(payload).getProperties(),
    );
  };

  getEvSitemapOrganizations(): Promise<EvSitemapOrganization[]> {
    return this.searchDocuments.getEvSitemapOrganizations();
  }

  async getOrgsListWithSearch(
    params: OrgListParams & { ecosystemHeader?: string },
  ): Promise<PaginatedData<ShortOrgWithSummary>> {
    const postgresPage = await this.searchDocuments.searchOrganizations(params);
    return {
      ...postgresPage,
      data: postgresPage.data.map(payload =>
        toShortOrgWithSummary(new OrgListResultEntity(payload).getProperties()),
      ),
    };
  }

  async getAllOrgsList(): Promise<Array<TinyOrg>> {
    try {
      const orgs = await this.getOrgListResults();
      const all = orgs.map(org => new TinyOrg(org));

      const unique = [];
      for (const org of all) {
        if (!unique.find(x => x.orgId === org.orgId)) {
          unique.push(org);
        }
      }

      return unique;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::getAllOrgsList ${err.message}`);
      return [];
    }
  }

  async getFilterConfigs(
    ecosystem: string | undefined,
  ): Promise<OrgFilterConfigs> {
    const values =
      await this.searchDocuments.getOrganizationFilterValues(ecosystem);
    return new OrgFilterConfigsEntity(values).getProperties();
  }

  async getOrgDetailsById(
    orgId: string,
    ecosystem: string | undefined,
  ): Promise<OrgDetailsResult | undefined> {
    try {
      const payload = await this.searchDocuments.getOrganizationById(
        orgId,
        ecosystem,
      );
      if (!payload) {
        return undefined;
      }
      return new OrgDetailsResultEntity({
        ...payload,
        jobs: (payload as OrgDetailsResult).jobs ?? [],
        tags: payload.tags ?? [],
      }).getProperties();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgDetailsById ${err.message}`,
      );
      return undefined;
    }
  }

  async getOrgDetailsBySlug(
    slug: string,
    ecosystem: string | undefined,
  ): Promise<OrgListResult | undefined> {
    try {
      const payload = await this.searchDocuments.getOrganizationBySlug(
        slug,
        ecosystem,
      );
      if (!payload) {
        return undefined;
      }
      return new OrgDetailsResultEntity({
        ...payload,
        jobs: (payload as OrgDetailsResult).jobs ?? [],
        tags: payload.tags ?? [],
      }).getProperties();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", slug);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgDetailsBySlug ${err.message}`,
      );
      return undefined;
    }
  }

  async getAllWithLinks(): Promise<OrganizationWithLinks[]> {
    const payloads = await this.searchDocuments.getOrganizationsWithLinks();
    return payloads.map(payload =>
      new OrganizationWithLinksEntity(
        payload as unknown as OrganizationWithLinks,
      ).getProperties(),
    );
  }

  async getAllForAdminGrid(
    limit: number,
    offset: number,
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    return this.searchDocuments.getOrganizationsForAdminGrid(limit, offset);
  }

  async getAll(): Promise<ShortOrg[]> {
    try {
      return (await this.getOrgListResults()).map(org => toShortOrg(org));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::getAll ${err.message}`);
      return undefined;
    }
  }

  async searchOrganizations(
    params: SearchOrganizationsInput,
    ecosystem: string | undefined,
  ): Promise<PaginatedData<ShortOrgWithSummary>> {
    return this.getOrgsListWithSearch({
      ...params,
      ecosystemHeader: ecosystem,
    } as OrgListParams & { ecosystemHeader?: string });
  }

  async getOrgById(id: string): Promise<OrganizationWithLinks | undefined> {
    const payloads = await this.searchDocuments.getOrganizationsWithLinks(id);
    return payloads[0]
      ? new OrganizationWithLinksEntity(
          payloads[0] as unknown as OrganizationWithLinks,
        ).getProperties()
      : undefined;
  }

  async getRepositories(id: string): Promise<Repository[]> {
    const repositories = await this.graph.findRelatedNodes<Repository>({
      sourceLabel: "Organization",
      sourceWhere: { id },
      relationshipType: "HAS_REPOSITORY",
      targetLabel: "GithubRepository",
    });
    return repositories.map(repository =>
      new RepositoryEntity(repository.properties as Repository).getProperties(),
    );
  }

  async find(name: string): Promise<OrganizationEntity | undefined> {
    const organization = await this.graph.findNode<Organization>(
      "Organization",
      { name },
    );
    return organization
      ? new OrganizationEntity(organization.properties)
      : undefined;
  }

  async findById(id: string): Promise<OrganizationEntity | undefined> {
    const organization = await this.graph.findNode<Organization>(
      "Organization",
      { id },
    );
    return organization
      ? new OrganizationEntity(organization.properties)
      : undefined;
  }

  async findAll(): Promise<OrganizationEntity[] | undefined> {
    const organizations =
      await this.graph.findNodes<Organization>("Organization");
    return organizations.map(
      organization => new OrganizationEntity(organization.properties),
    );
  }

  async findByOrgId(orgId: string): Promise<OrganizationEntity | undefined> {
    const organization = await this.graph.findNode<Organization>(
      "Organization",
      { orgId },
    );
    return organization
      ? new OrganizationEntity(organization.properties)
      : undefined;
  }

  async findOrgIdByWebsite(
    domain: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const candidates = ensureProtocol(domain);
      if (!candidates.every(isValidUrl)) {
        return { success: false, message: "Invalid url" };
      }
      const domains = candidates.map(candidate => {
        const absolute = toAbsoluteURL(candidate);
        new URL(absolute);
        return absolute;
      });
      const result =
        await this.searchDocuments.findOrganizationIdByWebsite(domains);
      return {
        success: Boolean(result),
        message: result ? "Retrieved org id successfully" : "No org found",
        data: result,
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "OrganizationsService::findOrgIdByWebsite " + err.message,
      );
      return {
        success: false,
        message: "Error finding org id by website",
      };
    }
  }

  async create(
    organization: CreateOrganizationInput,
  ): Promise<OrganizationEntity> {
    const now = Date.now();
    const properties = {
      id: randomUUID(),
      orgId: organization.orgId,
      logoUrl: organization.logoUrl,
      name: organization.name,
      altName: organization.altName,
      description: organization.description,
      summary: organization.summary,
      location: organization.location,
      headcountEstimate: organization.headcountEstimate,
      normalizedName: slugify(organization.name),
      createdTimestamp: now,
      updatedTimestamp: now,
    };
    const created = await this.graph.createNode(
      "Organization",
      properties,
      properties.id,
    );
    await Promise.all([
      this.updateOrgWebsites({
        orgId: organization.orgId,
        websites: organization.websites ?? [],
      }),
      this.updateOrgTwitters({
        orgId: organization.orgId,
        twitters: organization.twitters ?? [],
      }),
      this.updateOrgGithubs({
        orgId: organization.orgId,
        githubs: organization.githubs ?? [],
      }),
      this.updateOrgDiscords({
        orgId: organization.orgId,
        discords: organization.discords ?? [],
      }),
      this.updateOrgDocs({
        orgId: organization.orgId,
        docsites: organization.docs ?? [],
      }),
      this.updateOrgTelegrams({
        orgId: organization.orgId,
        telegrams: organization.telegrams ?? [],
      }),
      this.updateOrgAliases({
        orgId: organization.orgId,
        aliases: organization.aliases ?? [],
      }),
    ]);
    return new OrganizationEntity(created.properties);
  }

  async addOrganizationByUrl(
    dto: AddOrganizationByUrlInput,
  ): Promise<ResponseWithNoData> {
    try {
      const url = this.configService.get<string>("ETL_DOMAIN");
      const authToken = await this.auth0Service.getETLToken();
      const response2 = await axios.get(
        `${url}/organization-importer/import-organization-by-url?url=${dto.url}&name=${dto.name}`,
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
          },
        },
      );
      if ([200, 201, 202].includes(response2.status)) {
        return {
          success: true,
          message: "Organization queued for import successfully",
        };
      } else {
        this.logger.warn(
          `Error queueing organization ${dto} for import: ${response2.data}`,
        );
        return {
          success: false,
          message: `Error adding organization: ${response2.statusText}`,
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "external-api-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::addOrganizationByUrl ${err.message}`,
      );
      return {
        success: false,
        message: `Error adding organization by url`,
      };
    }
  }

  async update(
    id: string,
    properties: Omit<
      UpdateOrganizationInput,
      | "grants"
      | "projects"
      | "ecosystems"
      | "aliases"
      | "website"
      | "twitter"
      | "github"
      | "discord"
      | "docs"
      | "telegram"
      | "jobsites"
      | "detectedJobsites"
    >,
  ): Promise<OrganizationEntity> {
    const [updated] = await this.graph.updateNodes<Organization>(
      "Organization",
      { orgId: id },
      {
        ...properties,
        normalizedName: slugify(properties.name),
        updatedTimestamp: Date.now(),
      } as Partial<Organization>,
    );
    if (!updated) {
      throw new Error("Organization " + id + " not found");
    }
    return new OrganizationEntity(updated.properties);
  }

  async delete(id: string, actor?: string): Promise<ResponseWithNoData> {
    return this.setBanned(
      id,
      true,
      "permanently banned through the legacy delete endpoint",
      actor,
    );
  }

  async setBanned(
    id: string,
    banned: boolean,
    reason?: string,
    actor?: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.setEntityBanned({
        label: "Organization",
        publicId: id,
        banned,
        reason,
        actor,
      });
      return {
        success: true,
        message: banned
          ? "Organization banned successfully"
          : "Organization unbanned successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(`OrganizationsService::setBanned ${err.message}`);
      return {
        success: false,
        message: banned
          ? "Failed to ban organization"
          : "Failed to unban organization",
      };
    }
  }

  async resolveManualReview(
    id: string,
    note?: string,
    actor?: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.resolveEntityManualReview({
        label: "Organization",
        publicId: id,
        note,
        actor,
      });
      return {
        success: true,
        message: "Organization manual review resolved successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        `OrganizationsService::resolveManualReview ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to resolve organization manual review",
      };
    }
  }

  async importOrganizationJobsiteById(
    dto: ImportOrgJobsiteInput,
  ): Promise<ResponseWithNoData> {
    try {
      const [jobsiteNode] = await this.graph.findRelatedNodes<Jobsite>({
        sourceLabel: "Organization",
        sourceWhere: { orgId: dto.orgId },
        relationshipType: "HAS_JOBSITE",
        targetLabel: "DetectedJobsite",
        targetWhere: { id: dto.jobsiteId },
      });
      const jobsite = jobsiteNode?.properties;
      if (jobsite) {
        const url = this.configService.get<string>("ETL_DOMAIN");
        const authToken = await this.auth0Service.getETLToken();
        const response2 = await axios.get(
          `${url}/jobposts/jobsite?jobsite=${jobsite.url}`,
          {
            headers: {
              Authorization: authToken ? `Bearer ${authToken}` : undefined,
            },
          },
        );
        if ([200, 201, 202].includes(response2.status)) {
          return {
            success: true,
            message: "Organization jobsite queued for import successfully",
          };
        } else {
          this.logger.warn(
            `Error queueing organization jobsite ${dto} for import: ${response2.data}`,
          );
          return {
            success: false,
            message: "Error importing organization jobsite",
          };
        }
      } else {
        return {
          success: false,
          message: "Organization jobsite not found",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "external-api-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::importOrganizationJobsiteById ${err.message}`,
      );
      return {
        success: false,
        message: `Error importing organization jobsite`,
      };
    }
  }

  async hasProjectRelationship(
    orgId: string,
    projectId: string,
  ): Promise<boolean> {
    return this.graph.hasRelationship({
      sourceLabel: "Organization",
      sourceWhere: { orgId },
      type: "HAS_PROJECT",
      targetLabel: "Project",
      targetWhere: { id: projectId },
    });
  }

  async relateToProjects(
    orgId: string,
    projectIds: string[],
  ): Promise<boolean> {
    try {
      await this.graph.setRelationshipsToNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId },
        type: "HAS_PROJECT",
        targetLabel: "Project",
        targetProperty: "id",
        targetValues: projectIds,
        replace: false,
      });
      return true;
    } catch (error) {
      Sentry.captureException(error);
      return false;
    }
  }

  async updateOrgAliases(
    dto: UpdateOrgAliasesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.aliases, {
      relationshipType: "HAS_ORGANIZATION_ALIAS",
      targetLabel: "OrganizationAlias",
      targetProperty: "name",
      resourceName: "aliases",
    });
  }

  async activateOrgJobsites(
    dto: ActivateOrgJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite[]>> {
    try {
      const jobsites = (
        await this.graph.relabelRelatedNodes<Jobsite>({
          sourceLabel: "Organization",
          sourceWhere: { orgId: dto.orgId },
          relationshipType: "HAS_JOBSITE",
          targetLabel: "DetectedJobsite",
          targetProperty: "id",
          targetValues: dto.jobsiteIds,
          newLabel: "Jobsite",
        })
      ).map(jobsite => jobsite.properties);
      return {
        success: true,
        message: "Activated organization jobsites successfully",
        data: jobsites,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::activateOrgJobsites ${err.message}`,
      );
      return { success: false, message: "Failed to activate org jobsites" };
    }
  }

  async updateOrgProjects(
    orgId: string,
    projectIds: string[],
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const projects = await this.graph.setRelationshipsToNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId },
        type: "HAS_PROJECT",
        targetLabel: "Project",
        targetProperty: "id",
        targetValues: projectIds,
        replace: true,
      });
      return {
        success: true,
        message: "Updated organization projects successfully",
        data: projects.map(project => String(project.properties.name)),
      };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, message: "Failed to update org projects" };
    }
  }

  async updateOrgWebsites(
    dto: UpdateOrgWebsitesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.websites, {
      relationshipType: "HAS_WEBSITE",
      targetLabel: "Website",
      targetProperty: "url",
      resourceName: "websites",
    });
  }

  async updateOrgJobsites(
    dto: UpdateOrgJobsitesInput,
  ): Promise<ResponseWithNoData> {
    try {
      const related = await this.graph.findRelatedNodes<Jobsite>({
        sourceLabel: "Organization",
        sourceWhere: { orgId: dto.orgId },
        relationshipType: "HAS_JOBSITE",
        targetLabel: "Jobsite",
      });
      const relatedIds = new Set(related.map(node => node.properties.id));
      await this.graph.updateNodesFromPatches<Jobsite>({
        label: "Jobsite",
        identityProperty: "id",
        patches: dto.jobsites
          .filter(jobsite => jobsite.id && relatedIds.has(jobsite.id))
          .map(jobsite => ({
            identity: jobsite.id,
            patch: { url: jobsite.url, type: jobsite.type },
          })),
      });

      return {
        success: true,
        message: "Updated organization jobsites successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgJobsites ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to update org jobsites",
      };
    }
  }

  async updateOrgDetectedJobsites(dto: {
    orgId: string;
    detectedJobsites: { id: string; url: string; type: string }[];
  }): Promise<ResponseWithNoData> {
    try {
      const now = Date.now();
      await this.graph.replaceOwnedRelatedNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId: dto.orgId },
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
        message: "Updated organization detected jobsites successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgDetectedJobsites ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to update org detected jobsites",
      };
    }
  }

  async updateOrgTwitters(
    dto: UpdateOrgTwittersInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.twitters, {
      relationshipType: "HAS_TWITTER",
      targetLabel: "Twitter",
      targetProperty: "username",
      resourceName: "twitters",
    });
  }

  async updateOrgGithubs(
    dto: UpdateOrgGithubsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.githubs, {
      relationshipType: "HAS_GITHUB",
      targetLabel: "GithubOrganization",
      targetProperty: "login",
      resourceName: "githubs",
    });
  }

  async updateOrgDiscords(
    dto: UpdateOrgDiscordsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.discords, {
      relationshipType: "HAS_DISCORD",
      targetLabel: "Discord",
      targetProperty: "invite",
      resourceName: "discords",
    });
  }

  async updateOrgDocs(
    dto: UpdateOrgDocsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.docsites, {
      relationshipType: "HAS_DOCSITE",
      targetLabel: "DocSite",
      targetProperty: "url",
      resourceName: "docsites",
    });
  }

  async updateOrgTelegrams(
    dto: UpdateOrgTelegramsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.telegrams, {
      relationshipType: "HAS_TELEGRAM",
      targetLabel: "Telegram",
      targetProperty: "username",
      resourceName: "telegrams",
    });
  }

  async updateOrgGrants(
    dto: UpdateOrgGrantsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    return this.replaceOrgLinks(dto.orgId, dto.grantsites, {
      relationshipType: "HAS_GRANTSITE",
      targetLabel: "GrantSite",
      targetProperty: "url",
      resourceName: "grantsites",
    });
  }

  private async replaceOrgLinks(
    orgId: string,
    values: string[],
    config: {
      relationshipType: string;
      targetLabel: string;
      targetProperty: string;
      resourceName: string;
    },
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const data = await this.graph.replaceRelatedValueNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId },
        type: config.relationshipType,
        targetLabel: config.targetLabel,
        targetProperty: config.targetProperty,
        values,
      });
      return {
        success: true,
        message: `Updated organization ${config.resourceName} successfully`,
        data,
      };
    } catch (error) {
      Sentry.captureException(error);
      this.logger.error(
        `OrganizationsService::replaceOrgLinks ${(error as Error).message}`,
      );
      return {
        success: false,
        message: `Failed to update organization ${config.resourceName}`,
      };
    }
  }

  async transformOrgToProject(
    id: string,
  ): Promise<ResponseWithOptionalData<Omit<Organization, "orgId">>> {
    try {
      const organization = await this.graph.findNode<Organization>(
        "Organization",
        { orgId: id },
      );
      if (!organization) {
        return { success: false, message: "Organization not found" };
      }
      const transformed = await this.graph.changeNodeLabel<
        Omit<Organization, "orgId">
      >({
        sourceLabel: "Organization",
        sourceWhere: { orgId: id },
        newLabel: "Project",
        conflictWhere: { name: organization.properties.name },
        removeProperties: ["orgId", "headcountEstimate"],
      });
      if (transformed.status === "conflict") {
        return {
          success: false,
          message: "Project already exists",
        };
      }
      if (transformed.status !== "updated") {
        return { success: false, message: "Organization not found" };
      }
      return {
        success: true,
        message: "Organization transformed successfully",
        data: transformed.node.properties,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::transformOrgToProject ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to transform org to project",
      };
    }
  }

  async addProjectToOrg(
    dto: UpdateOrgProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.setRelationshipsToNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId: dto.orgId },
        type: "HAS_PROJECT",
        targetLabel: "Project",
        targetProperty: "id",
        targetValues: [dto.projectId],
        replace: false,
      });
      return {
        success: true,
        message: "Project added to organization successfully",
      };
    } catch (error) {
      Sentry.captureException(error);
      return {
        success: false,
        message: "Failed to add project to organization",
      };
    }
  }

  async removeProjectFromOrg(
    dto: UpdateOrgProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.graph.deleteRelationshipBetween({
        sourceLabel: "Organization",
        sourceWhere: { orgId: dto.orgId },
        type: "HAS_PROJECT",
        targetLabel: "Project",
        targetWhere: { id: dto.projectId },
      });
      return {
        success: true,
        message: "Project removed from organization successfully",
      };
    } catch (error) {
      Sentry.captureException(error);
      return {
        success: false,
        message: "Failed to remove project from organization",
      };
    }
  }
}
