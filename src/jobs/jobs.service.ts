import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { differenceInHours } from "date-fns";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { PrivyService } from "src/auth/privy/privy.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { ModelService } from "src/model/model.service";
import { PricingType } from "src/payments/dto/create-charge.dto";
import { PaymentsService } from "src/payments/payments.service";
import { ScorerService } from "src/scorer/scorer.service";
import {
  AllJobListResultEntity,
  AllJobsFilterConfigsEntity,
  AllOrgJobsListResultEntity,
  JobApplicantEntity,
  JobDetailsEntity,
  JobpostFolderEntity,
} from "src/shared/entities";
import {
  notStringOrNull,
  paginate,
  publicationDateRangeGenerator,
  slugify,
} from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  AllJobsListResult,
  AllOrgJobsListResult,
  data,
  DateRange,
  FundingRound,
  JobApplicant,
  JobDetailsResult,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  JobListResultEntity,
  JobpostFolder,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RpcService } from "src/user/rpc.service";
import { AllJobsParams } from "./dto/all-jobs.input";
import { BlockJobsInput } from "./dto/block-jobs.input";
import { ChangeJobClassificationInput } from "./dto/change-classification.input";
import { ChangeJobCommitmentInput } from "./dto/change-commitment.input";
import { ChangeJobLocationTypeInput } from "./dto/change-location-type.input";
import { CreateJobFolderInput } from "./dto/create-job-folder.input";
import { EditJobTagsInput } from "./dto/edit-tags.input";
import { FeatureJobsInput } from "./dto/feature-jobs.input";
import { JobListParams } from "./dto/job-list.input";
import { UpdateJobApplicantListInput } from "./dto/update-job-applicant-list.input";
import { UpdateJobFolderInput } from "./dto/update-job-folder.input";
import { UpdateJobMetadataInput } from "./dto/update-job-metadata.input";
import { ChangeJobProjectInput } from "./dto/update-job-project.input";
import { TagsService } from "src/tags/tags.service";

@Injectable()
export class JobsService {
  private readonly logger = new CustomLogger(JobsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private readonly rpcService: RpcService,
    private readonly configService: ConfigService,
    private readonly scorerService: ScorerService,
    private readonly paymentsService: PaymentsService,
    private readonly privyService: PrivyService,
    private readonly profileService: ProfileService,
    private readonly tagsService: TagsService,
  ) {}

  getJobsListResults = async (): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
      WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      WITH DISTINCT tag, structured_jobpost
      OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
      OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
      WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
      WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
      WITH DISTINCT canonicalTag as tag, structured_jobpost
      WITH COLLECT(tag { .* }) as tags, structured_jobpost
      RETURN structured_jobpost {
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
          responsibilities: structured_jobpost.responsibilities,
          featured: structured_jobpost.featured,
          featureStartDate: structured_jobpost.featureStartDate,
          featureEndDate: structured_jobpost.featureEndDate,
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
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
      this.logger.log(`Found ${results.length} jobs`);
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

  getAllOrgJobsListResults = async (
    orgId: string,
  ): Promise<AllOrgJobsListResult[]> => {
    const results: AllOrgJobsListResult[] = [];
    const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (:Organization {orgId: $orgId})-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)
      MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
      WITH DISTINCT tag, structured_jobpost
      OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
      OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
      WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
      WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
      WITH DISTINCT canonicalTag as tag, structured_jobpost
      WITH COLLECT(tag { .* }) as tags, structured_jobpost
      RETURN structured_jobpost {
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
          responsibilities: structured_jobpost.responsibilities,
          featured: structured_jobpost.featured,
          featureStartDate: structured_jobpost.featureStartDate,
          featureEndDate: structured_jobpost.featureEndDate,
          isBlocked: CASE WHEN (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation) THEN true ELSE false END,
          isOnline: CASE WHEN (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) THEN true ELSE false END,
          project: [(structured_jobpost)<-[:HAS_JOB]->(project) | project {
            id: project.id,
            name: project.name
          }][0],
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery, { orgId })
      ).records.map(record => record.get("result") as AllOrgJobsListResult);
      for (const result of resultSet) {
        results.push(new AllOrgJobsListResultEntity(result).getProperties());
      }
      this.logger.log(`Found ${results.length} jobs`);
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
          CYPHER runtime = parallel
          MATCH (structured_jobpost:StructuredJobpost)
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WITH DISTINCT tag, structured_jobpost
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
          WITH DISTINCT canonicalTag as tag, structured_jobpost
          WITH COLLECT(tag { .* }) as tags, structured_jobpost
          RETURN structured_jobpost {
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
              responsibilities: structured_jobpost.responsibilities,
              offersTokenAllocation: structured_jobpost.offersTokenAllocation,
              isBlocked: CASE WHEN (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation) THEN true ELSE false END,
              isOnline: CASE WHEN (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) THEN true ELSE false END,
              timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
              classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
              commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
              locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
              project: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
                id: project.id,
                name: project.name
              }][0],
              organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
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
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      classifications: classificationFilterList,
      commitments: commitmentFilterList,
      communities: communityFilterList,
      token,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: JobListResult[] = [];

    try {
      const jobs = await this.getJobsListResults();
      results.push(...jobs);
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
      if (jlr.organization) {
        const {
          projects,
          investors,
          fundingRounds,
          name: orgName,
          headcountEstimate,
          community,
        } = jlr.organization;
        const {
          title,
          tags,
          seniority,
          locationType,
          classification,
          commitment,
          salary,
          salaryCurrency,
          timestamp,
        } = jlr;
        const matchesQuery =
          orgName.match(query) ||
          title.match(query) ||
          tags.filter(tag => tag.name.match(query)).length > 0 ||
          projects.filter(project => project.name.match(query)).length > 0;
        return (
          (!seniorityFilterList ||
            seniorityFilterList.includes(slugify(seniority))) &&
          (!locationFilterList ||
            locationFilterList.includes(slugify(locationType))) &&
          (!minHeadCount || (headcountEstimate ?? 0) >= minHeadCount) &&
          (!maxHeadCount || (headcountEstimate ?? 0) < maxHeadCount) &&
          (!minSalaryRange ||
            ((salary ?? 0) >= minSalaryRange && salaryCurrency === "USD")) &&
          (!maxSalaryRange ||
            ((salary ?? 0) < maxSalaryRange && salaryCurrency === "USD")) &&
          (!startDate || timestamp >= startDate) &&
          (!endDate || timestamp < endDate) &&
          (!projectFilterList ||
            projects.filter(x => projectFilterList.includes(slugify(x.name)))
              .length > 0) &&
          (!classificationFilterList ||
            classificationFilterList.includes(slugify(classification))) &&
          (!commitmentFilterList ||
            commitmentFilterList.includes(slugify(commitment))) &&
          (!communityFilterList ||
            community.filter(community =>
              communityFilterList.includes(slugify(community)),
            ).length > 0) &&
          (token === null ||
            projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
              .length > 0) &&
          (!minTvl ||
            projects.filter(x => (x?.tvl ?? 0) >= minTvl).length > 0) &&
          (!maxTvl ||
            projects.filter(x => (x?.tvl ?? 0) < maxTvl).length > 0) &&
          (!minMonthlyVolume ||
            projects.filter(x => (x?.monthlyVolume ?? 0) >= minMonthlyVolume)
              .length > 0) &&
          (!maxMonthlyVolume ||
            projects.filter(x => (x?.monthlyVolume ?? 0) < maxMonthlyVolume)
              .length > 0) &&
          (!minMonthlyFees ||
            projects.filter(x => (x?.monthlyFees ?? 0) >= minMonthlyFees)
              .length > 0) &&
          (!maxMonthlyFees ||
            projects.filter(x => (x?.monthlyFees ?? 0) < maxMonthlyFees)
              .length > 0) &&
          (!minMonthlyRevenue ||
            projects.filter(x => (x?.monthlyRevenue ?? 0) >= minMonthlyRevenue)
              .length > 0) &&
          (!maxMonthlyRevenue ||
            projects.filter(x => (x?.monthlyRevenue ?? 0) < maxMonthlyRevenue)
              .length > 0) &&
          (auditFilter === null ||
            projects.filter(x => x.audits.length > 0).length > 0 ===
              auditFilter) &&
          (hackFilter === null ||
            projects.filter(x => x.hacks.length > 0).length > 0 ===
              hackFilter) &&
          (!chainFilterList ||
            projects.filter(
              x =>
                x.chains.filter(y => chainFilterList.includes(slugify(y.name)))
                  .length > 0,
            ).length > 0) &&
          (!investorFilterList ||
            investors.filter(investor =>
              investorFilterList.includes(slugify(investor.name)),
            ).length > 0) &&
          (!fundingRoundFilterList ||
            fundingRoundFilterList.includes(
              slugify(
                sort<FundingRound>(fundingRounds).desc(x => x.date)[0]
                  ?.roundName,
              ),
            )) &&
          (!query || matchesQuery) &&
          (!tagFilterList ||
            tags.filter(tag => tagFilterList.includes(slugify(tag.name)))
              .length > 0)
        );
      } else {
        const {
          title,
          tags,
          seniority,
          locationType,
          classification,
          commitment,
          salary,
          salaryCurrency,
          timestamp,
        } = jlr;

        const matchesQuery =
          title.match(query) ||
          tags.filter(tag => tag.name.match(query)).length > 0;

        return (
          (!locationFilterList ||
            locationFilterList.includes(slugify(locationType))) &&
          (!seniorityFilterList ||
            seniorityFilterList.includes(slugify(seniority))) &&
          (!minSalaryRange ||
            ((salary ?? 0) >= minSalaryRange && salaryCurrency === "USD")) &&
          (!maxSalaryRange ||
            ((salary ?? 0) < maxSalaryRange && salaryCurrency === "USD")) &&
          (!startDate || timestamp >= startDate) &&
          (!endDate || timestamp < endDate) &&
          (!classificationFilterList ||
            classificationFilterList.includes(slugify(classification))) &&
          (!commitmentFilterList ||
            commitmentFilterList.includes(slugify(commitment))) &&
          (!query || matchesQuery) &&
          (!tagFilterList ||
            tags.filter(tag => tagFilterList.includes(slugify(tag.name)))
              .length > 0)
        );
      }
    };

    const filtered = results
      .filter(jobFilters)
      .map(x => new JobListResultEntity(x).getProperties());

    const getSortParam = (jlr: JobListResult): number => {
      const p1 =
        jlr?.organization?.projects.sort(
          (a, b) => b.monthlyVolume - a.monthlyVolume,
        )[0] ?? null;
      switch (orderBy) {
        case "audits":
          return p1?.audits?.length ?? 0;
        case "hacks":
          return p1?.hacks?.length ?? 0;
        case "chains":
          return p1?.chains?.length ?? 0;
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
            sort<FundingRound>(jlr?.organization?.fundingRounds ?? []).desc(
              x => x.date,
            )[0]?.date ?? 0
          );
        case "headcountEstimate":
          return jlr?.organization?.headcountEstimate ?? 0;
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
      final = sort<JobListResult>(filtered).by([
        { desc: (job): boolean => job.featured },
        { asc: (job): number => job.featureStartDate },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { desc: (job): number => getSortParam(job) },
      ]);
    } else {
      final = sort<JobListResult>(filtered).by([
        { desc: (job): boolean => job.featured },
        { asc: (job): number => job.featureStartDate },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { asc: (job): number => getSortParam(job) },
      ]);
    }

    this.logger.log(`Sorted ${final.length} jobs`);

    return paginate<JobListResult>(page, limit, final);
  }

  async getFilterConfigs(
    community: string | null = null,
  ): Promise<JobFilterConfigs> {
    try {
      const popularity =
        this.configService.get<string>("SKILL_THRESHOLD") ?? null;
      const tags = (await this.tagsService.getPopularTags(100)).map(
        x => x.name,
      );
      console.time("getFilterConfigs");
      const result = await this.neogma.queryRunner
        .run(
          `
            CYPHER runtime = parallel
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
              minSalaryRange: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND j.salaryCurrency CONTAINS "USD" | j.salary
              ]),
              maxSalaryRange: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND j.salaryCurrency CONTAINS "USD" | j.salary
              ]),
              minHeadCount: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END | org.headcountEstimate
              ]),
              maxHeadCount: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END | org.headcountEstimate
              ]),
              fundingRounds: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND]->(round: FundingRound)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | round.roundName
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
              projects: apoc.coll.toSet([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | project.name
              ]),
              classifications: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name
              ]),
              commitments: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_COMMITMENT]->(commitment:JobpostCommitment)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | commitment.name
              ]),
              chains: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | chain.name
              ]),
              locations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | location.name
              ]),
              organizations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END | org.name
              ]),
              seniority: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
                AND j.seniority IS NOT NULL | j.seniority
              ])
            } as res
          `,
          { community, popularity },
        )
        .then(res =>
          res.records.length
            ? new JobFilterConfigsEntity({
                ...res.records[0].get("res"),
                tags,
              }).getProperties()
            : undefined,
        );
      console.timeEnd("getFilterConfigs");
      return result;
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

  async getFeaturedJobs(
    community: string | undefined,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    try {
      const jobs = await this.getJobsListResults();
      const now = new Date().getTime();
      const featured = community
        ? jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.organization.community.includes(community) &&
                job.featured === true &&
                job.featureStartDate <= now &&
                now <= job.featureEndDate,
            )
        : jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.featured === true &&
                job.featureStartDate <= now &&
                now <= job.featureEndDate,
            );
      const result = sort<JobListResult>(featured).by([
        { desc: (job): boolean => job.featured },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { asc: (job): number => job.featureStartDate },
      ]);
      return {
        success: true,
        message: "Featured jobs retrieved successfully",
        data: result,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getFeaturedJobs ${err.message}`);
      return { success: false, message: "Failed to retrieve featured jobs" };
    }
  }

  async getJobDetailsByUuid(
    uuid: string,
    community: string | undefined,
    protectLink = true,
  ): Promise<JobDetailsResult | undefined> {
    try {
      const generatedQuery = `
      CYPHER runtime = pipelined
      MATCH (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID})-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
      WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      WITH DISTINCT tag, structured_jobpost
      OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
      OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
      WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
      WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
      WITH DISTINCT canonicalTag as tag, structured_jobpost
      WITH COLLECT(tag { .* }) as tags, structured_jobpost
      RETURN structured_jobpost {
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
          responsibilities: structured_jobpost.responsibilities,
          featured: structured_jobpost.featured,
          featureStartDate: structured_jobpost.featureStartDate,
          featureEndDate: structured_jobpost.featureEndDate,
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;
      const result = await this.neogma.queryRunner.run(generatedQuery, {
        shortUUID: uuid,
      });
      const job = result.records[0]?.get("result")
        ? new JobDetailsEntity(
            result.records[0]?.get("result") as JobDetailsResult,
          ).getProperties(protectLink)
        : undefined;
      if (community) {
        return job?.organization.community.includes(community)
          ? job
          : undefined;
      } else {
        return job;
      }
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

  async getJobsByOrgId(
    id: string,
    community: string | undefined,
  ): Promise<JobListResult[] | undefined> {
    try {
      if (community) {
        return (await this.getJobsListResults())
          .filter(
            x =>
              x?.organization?.orgId === id &&
              x?.organization?.community.includes(community),
          )
          .map(orgJob => new JobListResultEntity(orgJob).getProperties());
      } else {
        return (await this.getJobsListResults())
          .filter(x => x?.organization?.orgId === id)
          .map(orgJob => new JobListResultEntity(orgJob).getProperties());
      }
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

  async getAllJobsByOrgId(
    id: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<AllOrgJobsListResult>> {
    try {
      return paginate<AllOrgJobsListResult>(
        page ?? 1,
        limit ?? 20,
        await this.getAllOrgJobsListResults(id),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getAllJobsByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getJobsByOrgIdWithApplicants(
    orgId: string,
    list:
      | "all"
      | "shortlisted"
      | "archived"
      | "new"
      | "interviewing"
      | "hired" = "all",
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    try {
      const generatedQuery = `
        CYPHER runtime = pipelined
        MATCH (org:Organization {orgId: $orgId})-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WITH DISTINCT tag, structured_jobpost
        OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
        OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
        WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
        WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
        WITH DISTINCT canonicalTag as tag, structured_jobpost
        WITH COLLECT(tag { .* }) as tags, structured_jobpost
      
        MATCH (user:User)-[r:APPLIED_TO]->(structured_jobpost)
        WHERE user.available = true

        AND
          CASE
            WHEN $list = "all" THEN true
            WHEN $list = "new" THEN r.list IS NULL
            WHEN $list IS NOT NULL THEN r.list = $list
            ELSE true
          END

        RETURN {
          oss: null,
          calendly: null,
          interviewed: null,
          attestations: {
            upvotes: null,
            downvotes: null
          },
          note: [(user)-[:HAS_RECRUITER_NOTE]->(note: RecruiterNote)<-[:HAS_TALENT_NOTE]-(organization) | note.note][0],
          cryptoNative: user.cryptoNative,
          cryptoAdjacent: user.cryptoAdjacent,
          appliedTimestamp: r.timestamp,
          user: {
              wallet: user.wallet,
              availableForWork: user.available,
              name: user.name,
              githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
              alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
              linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account {
                .*,
                wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address]
              }][0],
              location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0],
              matchingSkills: apoc.coll.sum([
                (user)-[:HAS_SKILL]->(tag)
                WHERE (structured_jobpost)-[:HAS_TAG]->(tag) | 1
              ]),
              skills: apoc.coll.toSet([
                (user)-[:HAS_SKILL]->(tag) |
                tag {
                  .*,
                  canTeach: [(user)-[m:HAS_SKILL]->(tag) | m.canTeach][0]
                }
              ]),
              showcases: apoc.coll.toSet([
                (user)-[:HAS_SHOWCASE]->(showcase) |
                showcase {
                  .*
                }
              ]),
              workHistory: apoc.coll.toSet([
                (user)-[:HAS_WORK_HISTORY]->(workHistory: UserWorkHistory) |
                workHistory {
                  .*,
                  repositories: apoc.coll.toSet([
                    (workHistory)-[:WORKED_ON_REPO]->(repo: UserWorkHistoryRepo) |
                    repo {
                      .*
                    }
                  ])
                }
              ])
          },
          job: structured_jobpost {
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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
          }
        } as result
      `;
      const result = await this.neogma.queryRunner.run(generatedQuery, {
        orgId,
        list,
      });
      const applicants =
        result?.records?.map(record => record.get("result")) ?? [];

      const ecosystemActivations =
        await this.scorerService.getWalletEcosystemActivations(
          applicants.flatMap(x => x?.linkedAccounts?.wallets).filter(Boolean),
          orgId,
        );

      return {
        success: true,
        message: "Org jobs and applicants retrieved successfully",
        data: applicants?.map((applicant: JobApplicant) => {
          return new JobApplicantEntity({
            ...applicant,
            ecosystemActivations:
              ecosystemActivations.find(x => x.wallet === applicant.user.wallet)
                ?.ecosystemActivations ?? [],
          }).getProperties();
        }),
      };
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
        `JobsService::getJobsByOrgIdWithApplicants ${err.message}`,
      );

      return {
        success: false,
        message: "Org jobs and applicants retrieval failed",
      };
    }
  }

  async getJobApplicants(
    list:
      | "all"
      | "shortlisted"
      | "archived"
      | "new"
      | "interviewing"
      | "hired" = "all",
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    try {
      const generatedQuery = `
        CYPHER runtime = parallel
        MATCH (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WITH DISTINCT tag, structured_jobpost
        OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
        OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
        WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
        WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
        WITH DISTINCT canonicalTag as tag, structured_jobpost
        WITH COLLECT(tag { .* }) as tags, structured_jobpost
      
        MATCH (user:User)-[r:APPLIED_TO]->(structured_jobpost)
        WHERE user.available = true

        AND
          CASE
            WHEN $list = "all" THEN true
            WHEN $list = "new" THEN r.adminList IS NULL
            WHEN $list IS NOT NULL THEN r.adminList = $list
            ELSE true
          END

        RETURN {
          oss: null,
          calendly: null,
          interviewed: null,
          attestations: {
            upvotes: null,
            downvotes: null
          },
          cryptoNative: user.cryptoNative,
          appliedTimestamp: r.timestamp,
          user: {
              wallet: user.wallet,
              availableForWork: user.available,
              email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email][0],
              username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
              linkedWallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address],
              avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
              location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0],
              matchingSkills: apoc.coll.sum([
                (user)-[:HAS_SKILL]->(tag)
                WHERE (structured_jobpost)-[:HAS_TAG]->(tag) | 1
              ]),
              skills: apoc.coll.toSet([
                (user)-[:HAS_SKILL]->(tag) |
                tag {
                  .*,
                  canTeach: [(user)-[m:HAS_SKILL]->(tag) | m.canTeach][0]
                }
              ]),
              showcases: apoc.coll.toSet([
                (user)-[:HAS_SHOWCASE]->(showcase) |
                showcase {
                  .*
                }
              ]),
              workHistory: apoc.coll.toSet([
                (user)-[:HAS_WORK_HISTORY]->(workHistory: UserWorkHistory) |
                workHistory {
                  .*,
                  repositories: apoc.coll.toSet([
                    (workHistory)-[:WORKED_ON_REPO]->(repo: UserWorkHistoryRepo) |
                    repo {
                      .*
                    }
                  ])
                }
              ])
          },
          job: structured_jobpost {
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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
          }
        } as result
      `;
      const result = await this.neogma.queryRunner.run(generatedQuery, {
        list,
      });
      const applicants =
        result?.records?.map(record => record.get("result")) ?? [];

      return {
        success: true,
        message: "Org jobs and applicants retrieved successfully",
        data: await Promise.all(
          applicants?.map(async (applicant: JobApplicant) => {
            const privyId = await this.profileService.getPrivyId(
              applicant.user.wallet,
            );
            const user = await this.privyService.getUser(privyId);
            const wallets =
              await this.privyService.getUserLinkedWallets(privyId);

            const ecosystemActivations =
              await this.rpcService.getCommunitiesForWallet(
                applicant.user.wallet,
              );
            return new JobApplicantEntity({
              ...applicant,
              user: {
                ...applicant.user,
                linkedAccounts: {
                  discord: user.discord?.username ?? null,
                  telegram: user.telegram?.username ?? null,
                  twitter: user.twitter?.username ?? null,
                  email: user.email?.address ?? null,
                  farcaster: user.farcaster?.username ?? null,
                  github: user.github?.username ?? null,
                  google: user.google?.email ?? null,
                  apple: user.apple?.email ?? null,
                  wallets,
                },
              },
              ecosystemActivations,
            }).getProperties();
          }),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", list);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobApplicants ${err.message}`);

      return {
        success: false,
        message: "Org jobs and applicants retrieval failed",
      };
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
      category: classificationFilterList,
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
      if (jlr.organization) {
        const { name: orgName } = jlr.organization;
        const { title: jobTitle, tags, classification } = jlr;

        const matchesQuery =
          orgName.match(query) ||
          jobTitle.match(query) ||
          tags.filter(tag => tag.name.match(query)).length > 0;

        return (
          (!classificationFilterList ||
            classificationFilterList.includes(slugify(classification))) &&
          (!query || matchesQuery) &&
          (!organizationFilterList ||
            organizationFilterList.includes(slugify(orgName)))
        );
      } else {
        return false;
      }
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
                category: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification) WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name]),
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
    community: string | undefined,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (:User {wallet: $wallet})-[:BOOKMARKED]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WITH DISTINCT tag, structured_jobpost
        OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
        OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
        WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
        WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
        WITH DISTINCT canonicalTag as tag, structured_jobpost
        WITH COLLECT(tag { .* }) as tags, structured_jobpost
        RETURN structured_jobpost {
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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        } AS result
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User bookmarked jobs retrieved successfully",
        data: community
          ? (result.records
              ?.map(record =>
                new JobListResultEntity(record.get("result")).getProperties(),
              )
              .filter(job => job.organization.community.includes(community)) ??
            [])
          : (result.records?.map(record =>
              new JobListResultEntity(record.get("result")).getProperties(),
            ) ?? []),
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

  async getUserAppliedJobs(
    wallet: string,
    community: string | undefined,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (:User {wallet: $wallet})-[:APPLIED_TO]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WITH DISTINCT tag, structured_jobpost
        OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
        OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
        WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
        WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
        WITH DISTINCT canonicalTag as tag, structured_jobpost
        WITH COLLECT(tag { .* }) as tags, structured_jobpost
        RETURN structured_jobpost {
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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        } AS result
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User applied jobs retrieved successfully",
        data: community
          ? (result.records
              ?.map(record =>
                new JobListResultEntity(record.get("result")).getProperties(),
              )
              .filter(job => job.organization.community.includes(community)) ??
            [])
          : (result.records?.map(record =>
              new JobListResultEntity(record.get("result")).getProperties(),
            ) ?? []),
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
      this.logger.error(`JobsService::getUserAppliedJobs ${err.message}`);
      return {
        success: false,
        message: "Error getting user applied jobs",
      };
    }
  }

  async getUserJobFolders(
    wallet: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (:User {wallet: $wallet})-[:CREATED_FOLDER]->(folder: JobpostFolder)
        OPTIONAL MATCH (folder)-[:CONTAINS_JOBPOST]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        
        CALL {
          WITH structured_jobpost
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN COLLECT(tag { .* }) as tags
        }

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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        })) as jobs, folder

        RETURN folder {
          .*,
          jobs: jobs
        } as result
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User job folders retrieved successfully",
        data:
          result.records?.map(record =>
            new JobpostFolderEntity(record.get("result")).getProperties(),
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
      this.logger.error(`JobsService::getUserJobFolders ${err.message}`);
      return {
        success: false,
        message: "Error getting user job folders",
      };
    }
  }

  async getUserJobFolderById(
    id: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (folder: JobpostFolder {id: $id})
        OPTIONAL MATCH (folder)-[:CONTAINS_JOBPOST]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        
        CALL {
          WITH structured_jobpost
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN COLLECT(tag { .* }) as tags
        }

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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        })) as jobs, folder

        RETURN folder {
          .*,
          jobs: jobs
        } as result
      `,
        { id },
      );

      const res = result?.records[0]?.get("result");

      if (res) {
        return {
          success: true,
          message: "User job folder retrieved successfully",
          data: new JobpostFolderEntity(res).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Public user job folder not found for that id",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { id });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getUserJobFolderById ${err.message}`);
      return {
        success: false,
        message: "Error getting user job folder by id",
      };
    }
  }

  async getPublicJobFolderBySlug(
    slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (folder: JobpostFolder {slug: $slug, isPublic: true})
        OPTIONAL MATCH (folder)-[:CONTAINS_JOBPOST]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        
        CALL {
          WITH structured_jobpost
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN COLLECT(tag { .* }) as tags
        }

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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        })) as jobs, folder

        RETURN folder {
          .*,
          jobs: jobs
        } as result
      `,
        { slug },
      );

      const res = result?.records[0]?.get("result");

      if (res) {
        return {
          success: true,
          message: "User job folder retrieved successfully",
          data: new JobpostFolderEntity(res).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Public user job folder not found for that slug",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { slug });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getUserJobFolderBySlug ${err.message}`);
      return {
        success: false,
        message: "Error getting user job folder by slug",
      };
    }
  }

  private async getJobFolderBySlug(
    slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (folder: JobpostFolder {slug: $slug})
        OPTIONAL MATCH (folder)-[:CONTAINS_JOBPOST]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        
        CALL {
          WITH structured_jobpost
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN COLLECT(tag { .* }) as tags
        }

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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        })) as jobs, folder

        RETURN folder {
          .*,
          jobs: jobs
        } as result
      `,
        { slug },
      );

      const res = result?.records[0]?.get("result");

      if (res) {
        return {
          success: true,
          message: "User job folder retrieved successfully",
          data: new JobpostFolderEntity(res).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Public user job folder not found for that slug",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { slug });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getUserJobFolderBySlug ${err.message}`);
      return {
        success: false,
        message: "Error getting user job folder by slug",
      };
    }
  }

  async getUserJobFolderBySlug(
    wallet: string,
    slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (:User {wallet: $wallet})-[:CREATED_FOLDER]->(folder: JobpostFolder {slug: $slug})
        OPTIONAL MATCH (folder)-[:CONTAINS_JOBPOST]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        
        CALL {
          WITH structured_jobpost
          MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN COLLECT(tag { .* }) as tags
        }

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
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization)) THEN true ELSE false END,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
              aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              projects: [
                (organization)-[:HAS_PROJECT]->(project) | project {
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
                  ]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
              grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
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
          }][0],
          project: [
            (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
              .*,
              atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
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
              ]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        })) as jobs, folder

        RETURN folder {
          .*,
          jobs: jobs
        } as result
      `,
        { wallet, slug },
      );

      const res = result?.records[0]?.get("result");

      if (res) {
        return {
          success: true,
          message: "User job folder retrieved successfully",
          data: new JobpostFolderEntity(res).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "User job folder not found for that slug",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { slug });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getUserJobFolderBySlug ${err.message}`);
      return {
        success: false,
        message: "Error getting user job folder by slug",
      };
    }
  }

  async updateJobApplicantList(
    dto: UpdateJobApplicantListInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            UNWIND $applicants AS applicant
            WITH applicant
            MATCH (user:User WHERE user.wallet = applicant.wallet)-[r:APPLIED_TO]->(structured_jobpost:StructuredJobpost WHERE structured_jobpost.shortUUID = applicant.job)
            SET r.adminList = $list
          `,
        { ...dto },
      );
      return {
        success: true,
        message: "Org job applicant list updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `JobsService::updateOrgJobApplicantList ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating org job applicant list",
      };
    }
  }

  async updateOrgJobApplicantList(
    orgId: string,
    dto: UpdateJobApplicantListInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            MATCH (:Organization {orgId: $orgId})-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
            WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
            AND (structured_jobpost)-[:HAS_TAG]->(:Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
            WITH structured_jobpost

            UNWIND $applicants AS applicant
            WITH applicant, structured_jobpost
            MATCH (user:User WHERE user.wallet = applicant.wallet)-[r:APPLIED_TO]->(structured_jobpost WHERE structured_jobpost.shortUUID = applicant.job)
            SET r.list = $list
          `,
        { orgId, ...dto },
      );
      return {
        success: true,
        message: "Org job applicant list updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { orgId, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `JobsService::updateOrgJobApplicantList ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating org job applicant list",
      };
    }
  }

  async createUserJobFolder(
    wallet: string,
    dto: CreateJobFolderInput,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const existing = data(await this.getJobFolderBySlug(slugify(dto.name)));
      if (existing) {
        return {
          success: false,
          message: "Folder with that name already exists",
        };
      } else {
        const result = await this.neogma.queryRunner.run(
          `
          CYPHER runtime = pipelined
        MATCH (user:User {wallet: $wallet})
        CREATE (folder:JobpostFolder {id: randomUUID()})
        SET folder.slug = $slug
        SET folder.name = $name
        SET folder.isPublic = $isPublic

        CREATE (user)-[:CREATED_FOLDER]->(folder)

        WITH folder

        OPTIONAL MATCH (job:StructuredJobpost WHERE job.shortUUID IN $jobs)
        CREATE (folder)-[:CONTAINS_JOBPOST]->(job)

        RETURN folder { .* } as folder
        `,
          { wallet, ...dto, slug: slugify(dto.name) },
        );

        const res = result.records[0]?.get("folder");

        if (res) {
          const details = data(await this.getUserJobFolderById(res.id));
          return {
            success: true,
            message: "Job folder created successfully",
            data: details,
          };
        } else {
          return {
            success: false,
            message: "Job folder creation failed",
          };
        }
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::createUserJobFolder ${err.message}`);
      return {
        success: false,
        message: "Error creating job folder",
      };
    }
  }

  async updateUserJobFolder(
    id: string,
    dto: UpdateJobFolderInput,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const toUpdate = data(await this.getUserJobFolderById(id));
      const existing = data(await this.getJobFolderBySlug(slugify(dto.name)));
      if (existing && existing.id !== toUpdate.id) {
        return {
          success: false,
          message: "Folder with that name already exists",
        };
      } else {
        const result = await this.neogma.queryRunner.run(
          `
          CYPHER runtime = pipelined
        MATCH (folder:JobpostFolder {id: $id})
        SET folder.slug = $slug
        SET folder.name = $name
        SET folder.isPublic = $isPublic

        WITH folder
        OPTIONAL MATCH (folder)-[r:CONTAINS_JOBPOST]->(:StructuredJobpost)
        DETACH DELETE r

        WITH folder
        OPTIONAL MATCH (job:StructuredJobpost WHERE job.shortUUID IN $jobs)
        MERGE (folder)-[:CONTAINS_JOBPOST]->(job)

        RETURN folder { .* } as folder
        `,
          { id, ...dto, slug: slugify(dto.name) },
        );

        const res = result.records[0]?.get("folder");
        if (res) {
          const details = data(await this.getUserJobFolderById(id));
          return {
            success: true,
            message: "Job folder updated successfully",
            data: details,
          };
        } else {
          return {
            success: false,
            message: "Job folder update failed",
          };
        }
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { id, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::updateUserJobFolder ${err.message}`);
      return {
        success: false,
        message: "Error updating job folder",
      };
    }
  }

  async deleteUserJobFolder(id: string): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (folder:JobpostFolder {id: $id})
        DETACH DELETE folder
        `,
        { id },
      );
      return {
        success: true,
        message: "Job folder deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { id });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::deleteUserJobFolder ${err.message}`);
      return {
        success: false,
        message: "Error deleting job folder",
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
        MATCH (job:StructuredJobpost WHERE job.shortUUID IN $shortUUIDs)
        OPTIONAL MATCH (job)-[r:HAS_CLASSIFICATION]->(classification:JobpostClassification)
        DELETE r

        WITH job
        MATCH (classification:JobpostClassification {name: $classification})
        MERGE (job)-[r:HAS_CLASSIFICATION]->(classification)
        SET r.timestamp = timestamp()
        SET r.creator = $creatorWallet
      `,
        {
          shortUUIDs: dto.shortUUIDs,
          classification: dto.classification,
          creatorWallet: wallet,
        },
      );
      return {
        success: true,
        message: "Job classification changed successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
      const oldSkills = await this.models.StructuredJobposts.findRelationships({
        where: {
          source: {
            shortUUID: dto.shortUUID,
          },
        },
        alias: "tags",
      });

      for (const skill of oldSkills) {
        await this.models.StructuredJobposts.deleteRelationships({
          alias: "tags",
          where: {
            source: { shortUUID: dto.shortUUID },
            target: {
              id: skill.target.id,
              normalizedName: skill.target.normalizedName,
            },
          },
        });
      }

      for (const skill of dto.tags) {
        await this.models.StructuredJobposts.relateTo({
          alias: "tags",
          where: {
            source: {
              shortUUID: dto.shortUUID,
            },
            target: {
              normalizedName: skill,
            },
          },
          properties: {
            creator: wallet,
          },
        });
      }

      return {
        success: true,
        message: "Job tags updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
      await this.models.StructuredJobposts.deleteRelationships({
        alias: "commitment",
        where: {
          source: { shortUUID: dto.shortUUID },
        },
      });
      await this.models.StructuredJobposts.relateTo({
        alias: "commitment",
        where: {
          source: {
            shortUUID: dto.shortUUID,
          },
          target: {
            name: dto.commitment,
          },
        },
        properties: {
          creator: wallet,
        },
      });

      return {
        success: true,
        message: "Job commitment changed successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
      await this.models.StructuredJobposts.deleteRelationships({
        alias: "locationType",
        where: {
          source: { shortUUID: dto.shortUUID },
        },
      });
      await this.models.StructuredJobposts.relateTo({
        alias: "locationType",
        where: {
          source: {
            shortUUID: dto.shortUUID,
          },
          target: {
            name: dto.locationType,
          },
        },
        properties: {
          creator: wallet,
        },
      });

      return {
        success: true,
        message: "Job classification changed successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
      const oldProject = (
        await this.models.Projects.findRelationships({
          alias: "jobs",
          limit: 1,
          where: {
            target: {
              shortUUID: dto.shortUUID,
            },
          },
        })
      )[0];
      if (oldProject.target) {
        await this.models.Projects.deleteRelationships({
          alias: "jobs",
          where: {
            source: { id: oldProject.source.id },
            target: { shortUUID: dto.shortUUID },
          },
        });
      }
      await this.models.Projects.relateTo({
        alias: "jobs",
        where: {
          target: {
            shortUUID: dto.shortUUID,
          },
          source: {
            id: dto.projectId,
          },
        },
        properties: {
          creator: wallet,
        },
      });
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
  ): Promise<boolean> {
    try {
      await this.models.StructuredJobposts.update(job, {
        return: false,
        where: {
          shortUUID: shortUUID,
        },
      });
      return true;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { shortUUID, ...job });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::update ${err.message}`);
      return false;
    }
  }

  async blockJobs(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost WHERE job.shortUUID IN $shortUUIDs),(blocked:BlockedDesignation {name: "BlockedDesignation"})
        MERGE (job)-[r:HAS_JOB_DESIGNATION]->(blocked)
        SET r.timestamp = timestamp()
        SET r.creator = $creatorWallet
      `,
        {
          shortUUIDs: dto.shortUUIDs,
          creatorWallet: wallet,
        },
      );

      return {
        success: true,
        message: "Jobs blocked successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
        MATCH (job:StructuredJobpost WHERE job.shortUUID IN $shortUUIDs)-[r:HAS_JOB_DESIGNATION]->(blocked:BlockedDesignation {name: "BlockedDesignation"})
        DELETE r
      `,
        {
          shortUUIDs: dto.shortUUIDs,
          creatorWallet: wallet,
        },
      );

      return {
        success: true,
        message: "Jobs unblocked successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
      for (const uuid of dto.shortUUIDs) {
        await this.models.StructuredJobposts.deleteRelationships({
          alias: "onlineStatus",
          where: {
            source: {
              shortUUID: uuid,
            },
            target: {
              name: "online",
            },
          },
        });
        await this.models.StructuredJobposts.deleteRelationships({
          alias: "offlineStatus",
          where: {
            source: {
              shortUUID: uuid,
            },
            target: {
              name: "offline",
            },
          },
        });
        await this.models.StructuredJobposts.relateTo({
          alias: "offlineStatus",
          where: {
            source: {
              shortUUID: uuid,
            },
            target: {
              name: "offline",
            },
          },
          properties: {
            creator: wallet,
          },
        });
      }

      return {
        success: true,
        message: "Jobs made offline successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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
      for (const uuid of dto.shortUUIDs) {
        await this.models.StructuredJobposts.deleteRelationships({
          alias: "offlineStatus",
          where: {
            source: {
              shortUUID: uuid,
            },
            target: {
              name: "offline",
            },
          },
        });
        await this.models.StructuredJobposts.deleteRelationships({
          alias: "onlineStatus",
          where: {
            source: {
              shortUUID: uuid,
            },
            target: {
              name: "online",
            },
          },
        });
        await this.models.StructuredJobposts.relateTo({
          alias: "onlineStatus",
          where: {
            source: {
              shortUUID: uuid,
            },
            target: {
              name: "online",
            },
          },
          properties: {
            creator: wallet,
          },
        });
      }
      return {
        success: true,
        message: "Jobs made online successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
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

  async makeJobFeatured(dto: FeatureJobsInput): Promise<ResponseWithNoData> {
    try {
      const { endDate, startDate, shortUUID } = dto;
      const result = await this.models.StructuredJobposts.update(
        {
          featured: true,
          featureStartDate: new Date(startDate).getTime(),
          featureEndDate: new Date(endDate).getTime(),
        },
        { where: { shortUUID }, return: true },
      );

      const job = result[0];
      if (job) {
        return {
          success: true,
          message: "Job made featured successfully",
        };
      } else {
        return {
          success: false,
          message: "Job feature failed",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::makeJobFeatured ${err.message}`);
      return {
        success: false,
        message: "Error making job featured",
      };
    }
  }

  async getJobPromotionPaymentUrl(
    uuid: string,
    community: string,
  ): Promise<ResponseWithOptionalData<{ id: string; url: string }>> {
    try {
      const jobDetails = await this.getJobDetailsByUuid(uuid, community);
      if (!jobDetails) {
        return {
          success: false,
          message: "Job not found",
        };
      }
      const charge = await this.paymentsService.createCharge({
        name: jobDetails.title,
        description: "1 week job promotion",
        local_price: {
          amount: this.configService.get<string>("JOB_PROMOTION_PRICE"),
          currency: "USD",
        },
        pricing_type: PricingType.FIXED_PRICE,
        metadata: {
          jobId: uuid,
        },
        redirect_url: "https://jobstash.xyz/jobs",
      });

      if (charge) {
        return {
          success: true,
          message: "Job promotion payment url generated successfully",
          data: charge,
        };
      } else {
        return {
          success: false,
          message: "Job promotion payment url generation failed",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { uuid, community });
        Sentry.captureException(err);
      });
      this.logger.error(
        `JobsService::getJobPromotionPaymentUrl ${err.message}`,
      );
      return {
        success: false,
        message: "Error generating job promotion payment url",
      };
    }
  }
}
