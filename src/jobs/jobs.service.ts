import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import {
  AllJobListResultEntity,
  AllJobsFilterConfigsEntity,
  StructuredJobpostWithRelationsEntity,
} from "src/shared/entities";
import {
  normalizeString,
  notStringOrNull,
  paginate,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  DateRange,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  AllJobsListResult,
  JobListResultEntity,
  PaginatedData,
  ResponseWithNoData,
  Response,
  StructuredJobpostWithRelations,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AllJobsParams } from "./dto/all-jobs.input";
import { JobListParams } from "./dto/job-list.input";
import { ChangeJobClassificationInput } from "./dto/change-classification.input";
import { BlockJobsInput } from "./dto/block-jobs.input";
import { EditJobTagsInput } from "./dto/edit-tags.input";
import { UpdateJobMetadataInput } from "./dto/update-job-metadata.input";
import { ChangeJobCommitmentInput } from "./dto/change-commitment.input";
import { ChangeJobLocationTypeInput } from "./dto/change-location-type.input";
import { ChangeJobProjectInput } from "./dto/update-job-project.input";

@Injectable()
export class JobsService {
  private readonly logger = new CustomLogger(JobsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  getJobsListResults = async (): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
      WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) OR NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      OPTIONAL MATCH (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(other:Tag)--(:PairedDesignation|PreferredDesignation)
      WITH COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END) AS tags, structured_jobpost
      RETURN structured_jobpost {
          id: structured_jobpost.id,
          url: structured_jobpost.url,
          title: structured_jobpost.title,
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
          responsibilities: structured_jobpost.responsibilities,
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization) | organization {
              .*,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
              alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
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
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ])
          }][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records.map(record => record.get("result") as JobListResult);
      for (const result of resultSet) {
        results.push(new JobListResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsListResults ${err.message}`);
    }

    return results;
  };

  getAllJobsListResults = async (): Promise<AllJobsListResult[]> => {
    const results: AllJobsListResult[] = [];
    const generatedQuery = `
          MATCH (structured_jobpost:StructuredJobpost)
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) OR NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          OPTIONAL MATCH (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(other:Tag)--(:PairedDesignation|PreferredDesignation)
          WITH COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END) AS tags, structured_jobpost
          RETURN structured_jobpost {
              id: structured_jobpost.id,
              url: structured_jobpost.url,
              title: structured_jobpost.title,
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
              responsibilities: structured_jobpost.responsibilities,
              offersTokenAllocation: structured_jobpost.offersTokenAllocation,
              isBlocked: CASE WHEN (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation) THEN true ELSE false END,
              isOnline: CASE WHEN (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) THEN true ELSE false END,
              timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
              classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
              commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
              locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
              project: [(structured_jobpost)<-[:HAS_JOB]->(project) | project {
                id: project.id,
                name: project.name
              }][0],
              organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization) | organization {
                  orgId: organization.orgId,
                  name: organization.name,
                  projects: [
                    (organization)-[:HAS_PROJECT]->(project) | project {
                      id: project.id,
                      name: project.name
                    }
                  ]
              }][0],
            tags: apoc.coll.toSet(tags)
          } AS result
        `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records.map(record => record.get("result") as AllJobsListResult);
      for (const result of resultSet) {
        results.push(new AllJobListResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getAllJobsListResults ${err.message}`);
    }
    return results;
  };

  async getJobsListWithSearch(
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    const paramsPassed = {
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
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
      minSalaryRange,
      maxSalaryRange,
      minHeadCount,
      maxHeadCount,
      startDate,
      endDate,
      seniority: seniorityFilterList,
      locations: locationFilterList,
      tags: tagFilterList,
      audits: auditFilter,
      hacks: hackFilter,
      chains: chainFilterList,
      projects: projectFilterList,
      organizations: organizationFilterList,
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      classifications: classificationFilterList,
      token,
      mainNet,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: JobListResult[] = [];

    try {
      const orgJobs = await this.getJobsListResults();
      results.push(...orgJobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsListWithSearch ${err.message}`);
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const jobFilters = (jlr: JobListResult): boolean => {
      const {
        projects,
        investors,
        fundingRounds,
        name: orgName,
        headcountEstimate,
      } = jlr.organization;
      const {
        title,
        tags,
        seniority,
        locationType,
        classification,
        salary: salary,
        timestamp,
      } = jlr;
      const matchesQuery =
        orgName.match(query) ||
        title.match(query) ||
        tags.filter(tag => tag.name.match(query)).length > 0 ||
        projects.filter(project => project.name.match(query)).length > 0;
      return (
        (!organizationFilterList ||
          organizationFilterList.includes(normalizeString(orgName))) &&
        (!seniorityFilterList ||
          seniorityFilterList.includes(normalizeString(seniority))) &&
        (!locationFilterList ||
          locationFilterList.includes(normalizeString(locationType))) &&
        (!minHeadCount || (headcountEstimate ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headcountEstimate ?? 0) < maxHeadCount) &&
        (!minSalaryRange || (salary ?? 0) >= minSalaryRange) &&
        (!maxSalaryRange || (salary ?? 0) < maxSalaryRange) &&
        (!startDate || timestamp >= startDate) &&
        (!endDate || timestamp < endDate) &&
        (!projectFilterList ||
          projects.filter(x =>
            projectFilterList.includes(normalizeString(x.name)),
          ).length > 0) &&
        (!classificationFilterList ||
          classificationFilterList.includes(normalizeString(classification))) &&
        (!token ||
          projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
            .length > 0) &&
        (!mainNet || projects.filter(x => x.isMainnet).length > 0) &&
        (!minTvl || projects.filter(x => (x?.tvl ?? 0) >= minTvl).length > 0) &&
        (!maxTvl || projects.filter(x => (x?.tvl ?? 0) < maxTvl).length > 0) &&
        (!minMonthlyVolume ||
          projects.filter(x => (x?.monthlyVolume ?? 0) >= minMonthlyVolume)
            .length > 0) &&
        (!maxMonthlyVolume ||
          projects.filter(x => (x?.monthlyVolume ?? 0) < maxMonthlyVolume)
            .length > 0) &&
        (!minMonthlyFees ||
          projects.filter(x => (x?.monthlyFees ?? 0) >= minMonthlyFees).length >
            0) &&
        (!maxMonthlyFees ||
          projects.filter(x => (x?.monthlyFees ?? 0) < maxMonthlyFees).length >
            0) &&
        (!minMonthlyRevenue ||
          projects.filter(x => (x?.monthlyRevenue ?? 0) >= minMonthlyRevenue)
            .length > 0) &&
        (!maxMonthlyRevenue ||
          projects.filter(x => (x?.monthlyRevenue ?? 0) < maxMonthlyRevenue)
            .length > 0) &&
        (!auditFilter ||
          projects.filter(x => x.audits.length > 0).length > 0 ===
            auditFilter) &&
        (!hackFilter ||
          projects.filter(x => x.hacks.length > 0).length > 0 === hackFilter) &&
        (!chainFilterList ||
          projects.filter(
            x =>
              x.chains.filter(y =>
                chainFilterList.includes(normalizeString(y.name)),
              ).length > 0,
          ).length > 0) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(normalizeString(investor.name)),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRounds.filter(fundingRound =>
            fundingRoundFilterList.includes(
              normalizeString(fundingRound.roundName),
            ),
          ).length > 0) &&
        (!query || matchesQuery) &&
        (!tagFilterList ||
          tags.filter(tag => tagFilterList.includes(normalizeString(tag.name)))
            .length > 0)
      );
    };

    const filtered = results.filter(jobFilters);

    const getSortParam = (jlr: JobListResult): number => {
      const p1 = jlr.organization.projects.sort(
        (a, b) => b.monthlyVolume - a.monthlyVolume,
      )[0];
      switch (orderBy) {
        case "audits":
          return p1?.audits.length ?? 0;
        case "hacks":
          return p1?.hacks.length ?? 0;
        case "chains":
          return p1?.chains.length ?? 0;
        case "tvl":
          return p1?.tvl ?? 0;
        case "monthlyVolume":
          return p1?.monthlyVolume ?? 0;
        case "monthlyFees":
          return p1?.monthlyFees ?? 0;
        case "monthlyRevenue":
          return p1?.monthlyRevenue ?? 0;
        case "fundingDate":
          return (
            jlr.organization.fundingRounds.sort((a, b) => b.date - a.date)[0]
              ?.date ?? 0
          );
        case "headcountEstimate":
          return jlr.organization?.headcountEstimate ?? 0;
        case "publicationDate":
          return jlr.timestamp;
        case "salary":
          return jlr.salary;
        default:
          return jlr.timestamp;
      }
    };

    let final = [];
    if (!order || order === "desc") {
      final = sort<JobListResult>(filtered).desc(getSortParam);
    } else {
      final = sort<JobListResult>(filtered).asc(getSortParam);
    }

    return paginate<JobListResult>(
      page,
      limit,
      final.map(x => new JobListResultEntity(x).getProperties()),
    );
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
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
              minSalaryRange: apoc.coll.min([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | j.salary]),
              maxSalaryRange: apoc.coll.max([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | j.salary]),
              minHeadCount: apoc.coll.min([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.headcountEstimate]),
              maxHeadCount: apoc.coll.max([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.headcountEstimate]),
              tags: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_TAG]->(tag:Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
                WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name
              ]),
              fundingRounds: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND]->(round: FundingRound) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | round.roundName
              ]),
              investors: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | investor.name
              ]),
              projects: apoc.coll.toSet([
                (org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | project.name
              ]),
              classifications: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification)
                WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name
              ]),
              chains: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus))
                AND NOT EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)) | chain.name
              ]),
              locations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType)
                WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | location.name
              ]),
              organizations: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.name]),
              seniority: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE j.seniority IS NOT NULL | j.seniority])
            } as res
          `,
        )
        .then(res =>
          res.records.length
            ? new JobFilterConfigsEntity(
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
      this.logger.error(`JobsService::getFilterConfigs ${err.message}`);
      return undefined;
    }
  }

  async getJobDetailsByUuid(uuid: string): Promise<JobListResult | undefined> {
    try {
      const generatedQuery = `
      MATCH (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID})-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
      WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) OR NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      OPTIONAL MATCH (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(other:Tag)--(:PairedDesignation|PreferredDesignation)
      WITH COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END) AS tags, structured_jobpost
      RETURN structured_jobpost {
          id: structured_jobpost.id,
          url: structured_jobpost.url,
          title: structured_jobpost.title,
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
          responsibilities: structured_jobpost.responsibilities,
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization) | organization {
              .*,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
              alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
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
                  twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                  hacks: [
                    (project)-[:HAS_HACK]->(hack) | hack { .* }
                  ],
                  audits: [
                    (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                  ],
                  chains: [
                    (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ])
          }][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;
      const result = await this.neogma.queryRunner.run(generatedQuery, {
        shortUUID: uuid,
      });
      return result.records[0]?.get("result")
        ? new JobListResultEntity(
            result.records[0]?.get("result") as JobListResult,
          ).getProperties()
        : undefined;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", uuid);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobDetailsByUuid ${err.message}`);
      return undefined;
    }
  }

  async getJobsByOrgId(id: string): Promise<JobListResult[] | undefined> {
    try {
      return (await this.getJobsListResults())
        .filter(x => x.organization.orgId === id)
        .map(orgJob => new JobListResultEntity(orgJob).getProperties());
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getAllJobsWithSearch(
    params: AllJobsParams,
  ): Promise<Response<AllJobsListResult[]>> {
    const paramsPassed = {
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
    };

    const {
      organizations: organizationFilterList,
      classifications: classificationFilterList,
      query,
    } = paramsPassed;

    const results: AllJobsListResult[] = [];

    try {
      const orgJobs = await this.getAllJobsListResults();
      results.push(...orgJobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getAllJobsWithSearch ${err.message}`);
      return {
        success: false,
        message: "Error retrieving all jobs",
        data: [],
      };
    }

    const jobFilters = (jlr: AllJobsListResult): boolean => {
      const { name: orgName } = jlr.organization;
      const { title: jobTitle, tags, classification } = jlr;

      const matchesQuery =
        orgName.match(query) ||
        jobTitle.match(query) ||
        tags.filter(tag => tag.name.match(query)).length > 0;

      return (
        (!classificationFilterList ||
          classificationFilterList.includes(normalizeString(classification))) &&
        (!query || matchesQuery) &&
        (!organizationFilterList ||
          organizationFilterList.includes(normalizeString(orgName)))
      );
    };

    const filtered = results.filter(jobFilters);

    const final = sort<AllJobsListResult>(filtered).desc(job => job.timestamp);

    return {
      success: true,
      message: "All jobposts retrieved successfully",
      data: final.map(x => new AllJobListResultEntity(x).getProperties()),
    };
  }

  async getAllJobsFilterConfigs(): Promise<AllJobsFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
            RETURN {
                classifications: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification) WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name]),
                organizations: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.name])
            } as res
          `,
        )
        .then(res =>
          res.records.length
            ? new AllJobsFilterConfigsEntity(
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
      this.logger.error(`JobsService::getAllJobsFilterConfigs ${err.message}`);
      return undefined;
    }
  }

  async getUserBookmarkedJobs(
    wallet: string,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (:User {wallet: $wallet})-[:BOOKMARKED]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) OR NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        OPTIONAL MATCH (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(other:Tag)--(:PairedDesignation|PreferredDesignation)
        WITH COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END) AS tags, structured_jobpost
        RETURN structured_jobpost {
            id: structured_jobpost.id,
            url: structured_jobpost.url,
            title: structured_jobpost.title,
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
            responsibilities: structured_jobpost.responsibilities,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp = NULL THEN structured_jobpost.timestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization) | organization {
                .*,
                discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
                alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
                twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
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
                    jobs: [
                      (project)-[:HAS_JOB]->(job) | job { .* }
                    ],
                    repos: [
                      (project)-[:HAS_REPOSITORY]->(repo) | repo { .* }
                    ]
                  }
                ],
                fundingRounds: apoc.coll.toSet([
                  (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                ]),
                investors: apoc.coll.toSet([
                  (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
                ])
            }][0],
            tags: apoc.coll.toSet(tags)
        } AS result
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User bookmarked jobs retrieved successfully",
        data:
          result.records?.map(record =>
            new JobListResultEntity(record.get("result")).getProperties(),
          ) ?? [],
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getUserBookmarkedJobs ${err.message}`);
      return {
        success: false,
        message: "Error getting user bookmarked jobs",
      };
    }
  }

  async changeJobClassification(
    wallet: string,
    dto: ChangeJobClassificationInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (jc:JobpostClassification {name: $classification})
        MATCH (structured_jobpost:StructuredJobpost WHERE structured_jobpost.shortUUID IN $shortUUIDs)-[c:HAS_CLASSIFICATION]->(:JobpostClassification)
        DELETE c
        
        WITH structured_jobpost, jc
        CREATE (structured_jobpost)-[nc:HAS_CLASSIFICATION]->(jc)
        SET nc.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Job classification changed successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::changeClassification ${err.message}`);
      return {
        success: false,
        message: "Error changing job classification",
      };
    }
  }

  async editJobTags(
    wallet: string,
    dto: EditJobTagsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID})
        OPTIONAL MATCH (structured_jobpost)-[r:HAS_TAG]->(:Tag)
        DELETE r

        WITH structured_jobpost
        MATCH (tag:Tag WHERE tag.normalizedName IN $tags)
        MERGE (structured_jobpost)-[nc:HAS_TAG]->(tag)
        SET nc.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Job tags updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::editJobTags ${err.message}`);
      return {
        success: false,
        message: "Error editing job tags",
      };
    }
  }

  async changeJobCommitment(
    wallet: string,
    dto: ChangeJobCommitmentInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (jc:JobpostCommitment {name: $commitment}), (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID})
        MATCH (structured_jobpost)-[c:HAS_COMMITMENT]->()
        DELETE c
        
        WITH structured_jobpost, jc
        CREATE (structured_jobpost)-[nc:HAS_COMMITMENT]->(jc)
        SET nc.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Job commitment changed successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::changeJobCommitment ${err.message}`);
      return {
        success: false,
        message: "Error changing job commitment",
      };
    }
  }

  async changeJobLocationType(
    wallet: string,
    dto: ChangeJobLocationTypeInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (jlt:JobpostLocationType {name: $locationType})
        MATCH (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID} )-[c:HAS_LOCATION_TYPE]->()
        DELETE c
        
        WITH structured_jobpost, jlt
        CREATE (structured_jobpost)-[nc:HAS_LOCATION_TYPE]->(jlt)
        SET nc.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Job classification changed successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::changeCommitment ${err.message}`);
      return {
        success: false,
        message: "Error changing job commitment",
      };
    }
  }

  async changeJobProject(
    wallet: string,
    dto: ChangeJobProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (project:Project {id: $projectId})
          MATCH (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID} )<-[c:HAS_JOB]-()
          DELETE c

          WITH structured_jobpost, project
          CREATE (structured_jobpost)<-[nc:HAS_JOB]-(project)
          SET nc.creator = $wallet
        `,
        { wallet, ...dto },
      );
      return {
        success: true,
        message: "Job project changed successfully",
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
      this.logger.error(`JobsService::changeJobProject ${err.message}`);
      return {
        success: false,
        message: "Failed to change job project",
      };
    }
  }

  async update(
    shortUUID: string,
    job: Omit<
      UpdateJobMetadataInput,
      | "commitment"
      | "classification"
      | "locationType"
      | "project"
      | "tags"
      | "isBlocked"
      | "isOnline"
    >,
  ): Promise<StructuredJobpostWithRelations | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (structured_jobpost:StructuredJobpost { shortUUID: $shortUUID })
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) OR NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        OPTIONAL MATCH (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(other:Tag)--(:PairedDesignation|PreferredDesignation)
        WITH COLLECT(CASE WHEN other IS NULL THEN tag { .* } ELSE other { .* } END) AS tags, structured_jobpost
        SET structured_jobpost += $properties
        RETURN {
          id: structured_jobpost.id,
          url: structured_jobpost.url,
          title: structured_jobpost.title,
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
          responsibilities: structured_jobpost.responsibilities,
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          tags: apoc.coll.toSet(tags)
        } as res
      `,
      {
        shortUUID,
        properties: {
          ...job,
          updatedTimestamp: new Date().getTime(),
        },
      },
    );
    return res.records.length
      ? new StructuredJobpostWithRelationsEntity(
          res.records[0].get("res"),
        ).getProperties()
      : undefined;
  }

  async blockJobs(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MERGE (structured_jobpost:StructuredJobpost WHERE structured_jobpost.shortUUID IN $shortUUIDs)-[br:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        SET br.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Jobs blocked successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::blockJobs ${err.message}`);
      return {
        success: false,
        message: "Error blocking jobs",
      };
    }
  }

  async unblockJobs(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (structured_jobpost:StructuredJobpost WHERE structured_jobpost.shortUUID IN $shortUUIDs)-[br:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        DETACH DELETE br
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Jobs unblocked successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::unblockJobs ${err.message}`);
      return {
        success: false,
        message: "Error unblocking jobs",
      };
    }
  }

  async makeJobsOffline(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (structured_jobpost:StructuredJobpost WHERE structured_jobpost.shortUUID IN $shortUUIDs)-[js:HAS_STATUS]->(:JobpostOnlineStatus)
        DELETE js

        WITH structured_jobpost
        MERGE (structured_jobpost)-[js:HAS_STATUS]->(:JobpostOfflineStatus)
        SET js.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Jobs made offline successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::makeJobsOffline ${err.message}`);
      return {
        success: false,
        message: "Error making jobs offline",
      };
    }
  }

  async makeJobsOnline(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (structured_jobpost:StructuredJobpost WHERE structured_jobpost.shortUUID IN $shortUUIDs)-[js:HAS_STATUS]->(:JobpostOfflineStatus)
        DELETE js

        WITH structured_jobpost
        MERGE (structured_jobpost)-[js:HAS_STATUS]->(:JobpostOnlineStatus)
        SET js.creator = $wallet
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "Jobs made online successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::makeJobsOnline ${err.message}`);
      return {
        success: false,
        message: "Error making jobs online",
      };
    }
  }
}
