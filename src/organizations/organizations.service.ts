import { Injectable } from "@nestjs/common";
import {
  ShortOrgEntity,
  ShortOrg,
  Repository,
  PaginatedData,
  OrgFilterConfigs,
  OrgFilterConfigsEntity,
  OrgListResult,
  OrgListResultEntity,
  OrganizationWithRelations,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { OrgListParams } from "./dto/org-list.input";
import { intConverter, toShortOrg } from "src/shared/helpers";
import { OrganizationEntity, RepositoryEntity } from "src/shared/entities";
import { createNewSortInstance, sort } from "fast-sort";
import { ModelService } from "src/model/model.service";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import NotFoundError from "src/shared/errors/not-found-error";

@Injectable()
export class OrganizationsService {
  private readonly logger = new CustomLogger(OrganizationsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  getOrgListResults = async (): Promise<OrgListResult[]> => {
    const results: OrgListResult[] = [];
    const generatedQuery = `
        MATCH (organization:Organization)
        RETURN organization {
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
            (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | structured_jobpost {
              .*,
              classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
              commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
              locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
              tags: [(structured_jobpost)-[:HAS_TAG]->(tag: Tag) WHERE NOT (tag)<-[:IS_BLOCKED_TERM]-() | tag { .* }]
            }
          ],
          projects: [
            (organization)-[:HAS_PROJECT]->(project) | project {
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
            }
          ],
          tags: [(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_BLOCKED_TERM]-() | tag { .* }]
        } as res
        `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records?.map(record => record?.get("res") as OrgListResult);
      for (const result of resultSet) {
        results.push(new OrgListResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgsListResults ${err.message}`,
      );
    }

    return results;
  };

  async getOrgsListWithSearch(
    params: OrgListParams,
  ): Promise<PaginatedData<ShortOrg>> {
    const paramsPassed = {
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const {
      minHeadCount,
      maxHeadCount,
      locations: locationFilterList,
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      hasJobs,
      hasProjects,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: OrgListResult[] = [];

    try {
      const result = await this.getOrgListResults();
      results.push(...result);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgsListWithSearch ${err.message}`,
      );
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const orgFilters = (org: OrgListResult): boolean => {
      const { headCount, jobCount, projectCount, location, name } =
        toShortOrg(org);
      const { fundingRounds, investors } = org;
      return (
        (!query || name.match(query)) &&
        (!hasJobs || jobCount > 0) &&
        (!hasProjects || projectCount > 0) &&
        (!minHeadCount || (headCount ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headCount ?? 0) < maxHeadCount) &&
        (!locationFilterList || locationFilterList.includes(location)) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(investor.name),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRounds.filter(fundingRound =>
            fundingRoundFilterList.includes(fundingRound.roundName),
          ).length > 0)
      );
    };

    const filtered = results.filter(orgFilters);

    const getSortParam = (org: OrgListResult): number | null => {
      const shortOrg = toShortOrg(org);
      const lastJob = sort(org.jobs).desc(x => x.lastSeenTimestamp)[0];
      switch (orderBy) {
        case "recentFundingDate":
          return shortOrg?.lastFundingDate ?? 0;
        case "recentJobDate":
          return lastJob?.lastSeenTimestamp ?? 0;
        case "headCount":
          return org?.headCount ?? 0;
        default:
          return null;
      }
    };

    let final: OrgListResult[] = [];
    const naturalSort = createNewSortInstance({
      comparer: new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
      }).compare,
    });
    if (!order || order === "asc") {
      final = naturalSort<OrgListResult>(filtered).asc(x =>
        params.orderBy ? getSortParam(x) : x.name,
      );
    } else {
      final = naturalSort<OrgListResult>(filtered).desc(x =>
        params.orderBy ? getSortParam(x) : x.name,
      );
    }

    return {
      page: (final.length > 0 ? page ?? 1 : -1) ?? -1,
      count: limit > final.length ? final.length : limit,
      total: final.length ? intConverter(final.length) : 0,
      data: final
        .slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        )
        .map(x => new ShortOrgEntity(toShortOrg(x)).getProperties()),
    };
  }

  async getFilterConfigs(): Promise<OrgFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
              MATCH (o:Organization)
              OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(f:FundingRound)
              OPTIONAL MATCH (f)-[:INVESTED_BY]->(i:Investor)
              WITH o, f, i
              RETURN {
                  minHeadCount: MIN(CASE WHEN NOT o.headCount IS NULL AND isNaN(o.headCount) = false THEN o.headCount END),
                  maxHeadCount: MAX(CASE WHEN NOT o.headCount IS NULL AND isNaN(o.headCount) = false THEN o.headCount END),
                  fundingRounds: COLLECT(DISTINCT f.roundName),
                  investors: COLLECT(DISTINCT i.name),
                  locations: COLLECT(DISTINCT o.location)
              } AS res
      `,
        )
        .then(res =>
          res.records.length
            ? new OrgFilterConfigsEntity(
                res.records[0].get("res"),
              ).getProperties()
            : undefined,
        );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getFilterConfigs ${err.message}`,
      );
      return undefined;
    }
  }

  async getOrgDetailsById(id: string): Promise<OrgListResult | undefined> {
    try {
      return (await this.getOrgListResults()).find(org => org.orgId === id);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgDetailsById ${err.message}`,
      );
      return undefined;
    }
  }

  async getAll(): Promise<ShortOrg[]> {
    try {
      return (await this.getOrgListResults()).map(org =>
        new ShortOrgEntity(toShortOrg(org)).getProperties(),
      );
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

  async searchOrganizations(query: string): Promise<ShortOrg[]> {
    const parsedQuery = new RegExp(query, "gi");
    try {
      const all = await this.getAll();
      return all.filter(x => x.name.match(parsedQuery));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", query);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::searchOrganizations ${err.message}`,
      );
      return undefined;
    }
  }

  async getOrgById(id: string): Promise<ShortOrg | undefined> {
    try {
      const all = await this.getAll();
      return all.find(x => x.orgId === id);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::getOrgById ${err.message}`);
      return undefined;
    }
  }

  async getRepositories(id: string): Promise<Repository[]> {
    return this.neogma.queryRunner
      .run(
        `
        MATCH (:Organization {orgId: $id})-[:HAS_REPOSITORY]->(r:Repository)
        RETURN r as res
        `,
        { id },
      )
      .then(res =>
        res.records.map(record => {
          const ent = new RepositoryEntity(record.get("res")).getProperties();
          return ent;
        }),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(
          `OrganizationsService::getRepositories ${err.message}`,
        );
        return undefined;
      });
  }

  async find(name: string): Promise<OrganizationEntity | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (o:Organization {name: $name})
        RETURN o
      `,
      { name },
    );
    return res.records.length
      ? new OrganizationEntity(res.records[0].get("o"))
      : undefined;
  }

  async findById(id: string): Promise<OrganizationWithRelations | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (o:Organization {id: $id})
        RETURN o
      `,
      { id },
    );
    return res.records.length
      ? new OrganizationWithRelations(res.records[0].get("o"))
      : undefined;
  }

  async findAll(): Promise<OrganizationWithRelations[] | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (o:Organization)
        RETURN o
      `,
    );
    return res.records.length
      ? res.records.map(
          resource => new OrganizationWithRelations(resource.get("o")),
        )
      : undefined;
  }

  async findByOrgId(orgId: string): Promise<OrganizationEntity | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (o:Organization {orgId: $orgId})
        RETURN o
      `,
      { orgId },
    );
    return res.records.length
      ? new OrganizationEntity(res.records[0].get("o"))
      : undefined;
  }

  async create(
    organization: CreateOrganizationInput,
  ): Promise<OrganizationEntity> {
    return this.neogma.queryRunner
      .run(
        `
            CREATE (o:Organization { id: randomUUID() })
            SET o += $properties
            RETURN o
        `,
        {
          properties: {
            ...organization,
          },
        },
      )
      .then(res => new OrganizationEntity(res.records[0].get("o")));
  }

  async update(
    id: string,
    properties: UpdateOrganizationInput,
  ): Promise<OrganizationEntity> {
    return this.neogma.queryRunner
      .run(
        `
            MATCH (o:Organization { id: $id })
            SET o += $properties
            RETURN o
        `,
        { id, properties },
      )
      .then(res => new OrganizationEntity(res.records[0].get("o")));
  }

  async hasProjectRelationship(
    organizationId: string,
    projectId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (o:Organization {id: $organizationId})
        MATCH (p:Project {id: $organizationId})
        WITH o, p
        RETURN EXISTS( (o)-[:HAS_PROJECT]->(p) ) AS result
        `,
      { organizationId, projectId },
    );

    if (!res.records?.length) {
      return false;
    }

    return res.records[0].get("result");
  }

  async relateToProject(
    organizationId: string,
    projectId: string,
  ): Promise<unknown> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (o:Organization {id: $organizationId})
        MATCH (p:Project {id: $projectId})

        MERGE (o)-[r:HAS_PROJECT]->(p)
        SET r.timestamp = timestamp()

        RETURN o {
          .*,
          relationshipTimestamp: r.timestamp
        } AS organization
        `,
      { organizationId, projectId },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between Organization ${organizationId} to Project ${projectId}`,
      );
    }

    const [first] = res.records;
    const organization = first.get("organization");
    return new OrganizationWithRelations(organization);
  }
}
