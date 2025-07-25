import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { addDays, differenceInHours } from "date-fns";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { PrivyService } from "src/auth/privy/privy.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import {
  AllJobListResultEntity,
  AllJobsFilterConfigsEntity,
  EcosystemJobListResultEntity,
  JobApplicantEntity,
  JobDetailsEntity,
  JobpostFolderEntity,
} from "src/shared/entities";
import {
  notStringOrNull,
  paginate,
  publicationDateRangeGenerator,
  slugify,
  sprinkleProtectedJobs,
} from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  AllJobsListResult,
  data,
  DateRange,
  EcosystemJobListResult,
  FundingRound,
  JobApplicant,
  JobDetailsResult,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  JobListResultEntity,
  JobpostFolder,
  PaginatedData,
  ProjectWithBaseRelations,
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
import { uniq } from "lodash";
import { go } from "fuzzysort";

@Injectable()
export class JobsService {
  private readonly logger = new CustomLogger(JobsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly rpcService: RpcService,
    private readonly configService: ConfigService,
    private readonly scorerService: ScorerService,
    private readonly privyService: PrivyService,
    private readonly profileService: ProfileService,
    private readonly tagsService: TagsService,
  ) {}

  getJobsListResults = async (
    ecosystem?: string | undefined,
  ): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(:Organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
      AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
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
          onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
          ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                      (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
            }
          ][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;

    try {
      const queryResult = await this.neogma.queryRunner.run(generatedQuery, {
        ecosystem: ecosystem ?? null,
      });
      const resultSet = queryResult.records.map(
        record => record.get("result") as JobListResult,
      );
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
  ): Promise<EcosystemJobListResult[]> => {
    const results: EcosystemJobListResult[] = [];
    const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (:Organization {orgId: $orgId})-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)
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
          onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
          ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
          responsibilities: structured_jobpost.responsibilities,
          featured: structured_jobpost.featured,
          featureStartDate: structured_jobpost.featureStartDate,
          featureEndDate: structured_jobpost.featureEndDate,
          blocked: EXISTS((structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)),
          online: CASE WHEN EXISTS((structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)) THEN true ELSE EXISTS((structured_jobpost)-[:HAS_STATUS]->(:JobpostOfflineStatus)) END,
          applications: apoc.coll.sum([(structured_jobpost)<-[:APPLIED_TO]-(:User) | 1]),
          views: apoc.coll.sum([(structured_jobpost)<-[:VIEWED_DETAILS]-(:User) | 1]),
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                      (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
            }
          ][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery, { orgId })
      ).records.map(record => record.get("result") as EcosystemJobListResult);
      for (const result of resultSet) {
        results.push(new EcosystemJobListResultEntity(result).getProperties());
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
              onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
              ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
    params: JobListParams & { ecosystemHeader?: string },
  ): Promise<PaginatedData<JobListResult>> {
    const paramsPassed = {
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
      ...params,
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
      commitments: commitmentFilterList,
      ecosystems: ecosystemFilterList,
      token,
      onboardIntoWeb3,
      ethSeasonOfInternships,
      query,
      order,
      orderBy,
      page,
      limit,
      ecosystemHeader,
    } = paramsPassed;

    const results: JobListResult[] = [];

    try {
      const jobs = await this.getJobsListResults(ecosystemHeader);
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

    const projectBasedFilters = (
      projects: ProjectWithBaseRelations[],
    ): boolean => {
      return (
        (!projectFilterList ||
          projects.filter(x => projectFilterList.includes(slugify(x.name)))
            .length > 0) &&
        (token === null ||
          projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
            .length > 0) &&
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
        (auditFilter === null ||
          projects.filter(x => x.audits.length > 0).length > 0 ===
            auditFilter) &&
        (hackFilter === null ||
          projects.filter(x => x.hacks.length > 0).length > 0 === hackFilter) &&
        (!chainFilterList ||
          uniq(projects.flatMap(x => x.chains)).filter(x =>
            chainFilterList.includes(slugify(x.name)),
          ).length > 0)
      );
    };

    const orgBasedFilters = (jlr: JobListResult): boolean => {
      const filters = [
        minHeadCount,
        maxHeadCount,
        organizationFilterList,
        investorFilterList,
        fundingRoundFilterList,
        ecosystemFilterList,
        projectFilterList,
        token,
        minTvl,
        maxTvl,
        minMonthlyVolume,
        maxMonthlyVolume,
        minMonthlyFees,
        maxMonthlyFees,
        minMonthlyRevenue,
        maxMonthlyRevenue,
        auditFilter,
        hackFilter,
        chainFilterList,
      ].filter(Boolean);
      const jobFromOrg = !!jlr.organization;
      const filtersApplied = filters.length > 0;

      if (!filtersApplied) return true;
      if (filtersApplied && !jobFromOrg) return false;

      const {
        projects,
        investors,
        fundingRounds,
        name: orgName,
        headcountEstimate,
        ecosystems,
      } = jlr.organization;
      const {
        tags,
        seniority,
        locationType,
        classification,
        commitment,
        salary,
        salaryCurrency,
        timestamp,
      } = jlr;

      return (
        projectBasedFilters(projects) &&
        (!organizationFilterList ||
          organizationFilterList.includes(slugify(orgName))) &&
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
        (!commitmentFilterList ||
          commitmentFilterList.includes(slugify(commitment))) &&
        (!ecosystemFilterList ||
          ecosystems.filter(ecosystem =>
            ecosystemFilterList.includes(slugify(ecosystem)),
          ).length > 0) &&
        (!classificationFilterList ||
          classificationFilterList.includes(slugify(classification))) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(slugify(investor.name)),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRoundFilterList.includes(
            slugify(
              sort<FundingRound>(fundingRounds).desc(x => x.date)[0]?.roundName,
            ),
          )) &&
        (!tagFilterList ||
          tags.filter(tag => tagFilterList.includes(slugify(tag.name))).length >
            0)
      );
    };

    const jobFilters = (jlr: JobListResult): boolean => {
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
        project,
        organization,
      } = jlr;

      const searchSpace = [
        title,
        jlr?.project?.name,
        organization?.name,
        ...tags.map(x => x.name),
        ...(organization?.aliases ?? []),
        ...(organization?.projects?.map(x => x.name) ?? []),
      ].filter(Boolean);

      const matching = query
        ? go(query, searchSpace, {
            threshold: 0.3,
          }).map(s => s.target)
        : [];

      const matchesQuery = matching.length > 0;

      return (
        (!organization || orgBasedFilters(jlr)) &&
        (!project || projectBasedFilters([project].filter(Boolean))) &&
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
        (onboardIntoWeb3 === null || jlr.onboardIntoWeb3 === onboardIntoWeb3) &&
        (ethSeasonOfInternships === null ||
          jlr.ethSeasonOfInternships === ethSeasonOfInternships) &&
        (!query || matchesQuery) &&
        (!tagFilterList ||
          tags.filter(tag => tagFilterList.includes(slugify(tag.name))).length >
            0)
      );
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

    const sprinkled = sprinkleProtectedJobs(final);

    return paginate<JobListResult>(page, limit, sprinkled);
  }

  async getFilterConfigs(
    ecosystem: string | null = null,
  ): Promise<JobFilterConfigs> {
    try {
      const tags = (await this.tagsService.getPopularTags(100)).map(
        x => x.name,
      );
      const result = await Promise.all([
        // Query 1: Project and Organization Metrics
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            RETURN {
              maxTvl: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
              ]),
              minTvl: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
              ]),
              minMonthlyVolume: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
              ]),
              maxMonthlyVolume: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
              ]),
              minMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
              ]),
              maxMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
              ]),
              minMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
              ]),
              maxMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
              ])
            } as res
          `,
          { ecosystem },
        ),

        // Query 2: Job-related Metrics
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            RETURN {
              minSalaryRange: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND j.salaryCurrency CONTAINS "USD" | j.salary
              ]),
              maxSalaryRange: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND j.salaryCurrency CONTAINS "USD" | j.salary
              ]),
              minHeadCount: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END | org.headcountEstimate
              ]),
              maxHeadCount: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END | org.headcountEstimate
              ])
            } as res
          `,
          { ecosystem },
        ),

        // Query 3: Organization Relationships
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            RETURN {
              fundingRounds: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND]->(round: FundingRound)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | round.roundName
              ]),
              investors: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | investor.name
              ]),
              ecosystems: apoc.coll.toSet([
                (org: Organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem: Ecosystem)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | ecosystem.name
              ]),
              projects: apoc.coll.toSet([
                (org)-[:HAS_PROJECT]->(project:Project)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | project.name
              ]),
              chains: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | chain.name
              ]),
              organizations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END | org.name
              ])
            } as res
          `,
          { ecosystem },
        ),

        // Query 4: Job Classifications and Details
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            RETURN {
              classifications: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name
              ]),
              commitments: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_COMMITMENT]->(commitment:JobpostCommitment)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | commitment.name
              ]),
              locations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | location.name
              ]),
              seniority: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND j.seniority IS NOT NULL | j.seniority
              ])
            } as res
          `,
          { ecosystem },
        ),
      ]).then(results => {
        const combinedResult = results.reduce((acc, curr) => {
          if (curr.records.length) {
            return { ...acc, ...curr.records[0].get("res") };
          }
          return acc;
        }, {});

        return new JobFilterConfigsEntity({
          ...combinedResult,
          tags,
        }).getProperties();
      });
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
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    try {
      const jobs = await this.getJobsListResults(ecosystem);
      const now = new Date().getTime();
      const featured = ecosystem
        ? jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
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

  async getFeaturedJobsByOrgId(
    ecosystem: string | undefined,
    orgId: string,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    try {
      const jobs = (await this.getJobsListResults()).filter(
        x => x?.organization?.orgId === orgId,
      );
      const now = new Date().getTime();
      const featured = ecosystem
        ? jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.organization.ecosystems.includes(ecosystem) &&
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
        message: "Org featured jobs retrieved successfully",
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
      this.logger.error(`JobsService::getFeaturedJobsByOrgId ${err.message}`);
      return {
        success: false,
        message: "Failed to retrieve featured jobs by orgId",
      };
    }
  }

  async getJobDetailsByUuid(
    uuid: string,
    ecosystem: string | undefined,
    protectLink = true,
  ): Promise<JobDetailsResult | undefined> {
    try {
      const generatedQuery = `
      CYPHER runtime = pipelined
      MATCH (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost {shortUUID: $shortUUID})-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
      AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
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
          onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
          ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
        ecosystem: ecosystem ?? null,
      });
      const job = result.records[0]?.get("result")
        ? new JobDetailsEntity(
            result.records[0]?.get("result") as JobDetailsResult,
          ).getProperties(protectLink)
        : undefined;
      return job;
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

  async getJobDetailsByUuidForUpdate(
    uuid: string,
  ): Promise<EcosystemJobListResult | undefined> {
    try {
      const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (structured_jobpost:StructuredJobpost {shortUUID: $shortUUID})
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
          onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
          ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
          responsibilities: structured_jobpost.responsibilities,
          featured: structured_jobpost.featured,
          featureStartDate: structured_jobpost.featureStartDate,
          featureEndDate: structured_jobpost.featureEndDate,
          blocked: EXISTS((structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)),
          online: EXISTS((structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)),
          applications: apoc.coll.sum([(structured_jobpost)<-[:APPLIED_TO]-(:User) | 1]),
          views: apoc.coll.sum([(structured_jobpost)<-[:VIEWED_DETAILS]-(:User) | 1]),
          timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
              .*,
              atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                      (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
            }
          ][0],
          tags: apoc.coll.toSet(tags)
      } AS result
    `;
      const result = await this.neogma.queryRunner.run(generatedQuery, {
        shortUUID: uuid,
      });
      const job = result.records[0]?.get("result")
        ? new EcosystemJobListResultEntity(
            result.records[0]?.get("result") as EcosystemJobListResult,
          ).getProperties()
        : undefined;
      return job;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", uuid);
        Sentry.captureException(err);
      });
      this.logger.error(
        `JobsService::getJobDetailsByUuidForUpdate ${err.message}`,
      );
      return undefined;
    }
  }

  async getJobsByOrgId(
    id: string,
    ecosystem: string | undefined,
  ): Promise<JobListResult[] | undefined> {
    try {
      return (await this.getJobsListResults(ecosystem))
        .filter(x => x?.organization?.orgId === id)
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

  async getAllJobsByOrgId(
    id: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<EcosystemJobListResult>> {
    try {
      return paginate<EcosystemJobListResult>(
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

  async getOrgAllJobsListFilters(id: string): Promise<JobFilterConfigs> {
    try {
      const tags = (await this.tagsService.getPopularTags(100)).map(
        x => x.name,
      );
      const result = await Promise.all([
        // Query 1: Project and Organization Metrics
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            MATCH (org:Organization {orgId: $id})
            RETURN {
              maxTvl: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) | project.tvl
              ]),
              minTvl: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project) | project.tvl
              ]),
              minMonthlyVolume: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project) | project.monthlyVolume
              ]),
              maxMonthlyVolume: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) | project.monthlyVolume
              ]),
              minMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) | project.monthlyFees
              ]),
              maxMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) | project.monthlyFees
              ]),
              minMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) | project.monthlyRevenue
              ]),
              maxMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project) | project.monthlyRevenue
              ])
            } as res
          `,
          { id },
        ),

        // Query 2: Job-related Metrics
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            MATCH (org:Organization {orgId: $id})
            RETURN {
              minSalaryRange: apoc.coll.min([
                (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost) WHERE j.salaryCurrency CONTAINS "USD" | j.salary
              ]),
              maxSalaryRange: apoc.coll.max([
                (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost) WHERE j.salaryCurrency CONTAINS "USD" | j.salary
              ]),
              minHeadCount: [org.headcountEstimate],
              maxHeadCount: [org.headcountEstimate]
            } as res
          `,
          { id },
        ),

        // Query 3: Organization Relationships
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            MATCH (org:Organization {orgId: $id})
            RETURN {
              fundingRounds: apoc.coll.toSet([
                (org)-[:HAS_FUNDING_ROUND]->(round: FundingRound) | round.roundName
              ]),
              investors: apoc.coll.toSet([
                (org)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor.name
              ]),
              ecosystems: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem: Ecosystem) | ecosystem.name
              ]),
              projects: apoc.coll.toSet([
                (org)-[:HAS_PROJECT]->(project:Project) | project.name
              ]),
              chains: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain) | chain.name
              ]),
              organizations: [org.name]
            } as res
          `,
          { id },
        ),

        // Query 4: Job Classifications and Details
        this.neogma.queryRunner.run(
          `
            CYPHER runtime = parallel
            MATCH (org:Organization {orgId: $id})
            RETURN {
              classifications: apoc.coll.toSet([
                (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification) | classification.name
              ]),
              commitments: apoc.coll.toSet([
                (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_COMMITMENT]->(commitment:JobpostCommitment) | commitment.name
              ]),
              locations: apoc.coll.toSet([
                (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType) | location.name
              ]),
              seniority: apoc.coll.toSet([
                (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost) WHERE j.seniority IS NOT NULL | j.seniority
              ])
            } as res
          `,
          { id },
        ),
      ]).then(results => {
        const combinedResult = results.reduce((acc, curr) => {
          if (curr.records.length) {
            return { ...acc, ...curr.records[0].get("res") };
          }
          return acc;
        }, {});

        return new JobFilterConfigsEntity({
          ...combinedResult,
          tags,
        }).getProperties();
      });
      return result;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getOrgAllJobsListFilters ${err.message}`);
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
          appliedTimestamp: r.createdTimestamp,
          user: {
              wallet: user.wallet,
              availableForWork: user.available,
              name: user.name,
              githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
              alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
              linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account { .* }][0],
              wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address],
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
        await this.scorerService.getAllUserEcosystemActivations(orgId);

      return {
        success: true,
        message: "Org jobs and applicants retrieved successfully",
        data: applicants?.map(applicant => {
          applicant.user.linkedAccounts.wallets = applicant.user.wallets;
          return new JobApplicantEntity({
            ...applicant,
            ecosystemActivations: applicant.user.linkedAccounts.wallets.flatMap(
              z =>
                ecosystemActivations
                  .find(x => x.wallet === z)
                  ?.ecosystemActivations?.map(x => x.name) ?? [],
            ),
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
          appliedTimestamp: r.createdTimestamp,
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
            const user = await this.privyService.getUserById(privyId);
            const wallets =
              await this.privyService.getUserLinkedWallets(privyId);

            const ecosystemActivations =
              await this.rpcService.getEcosystemsForWallet(
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
    ecosystem: string | undefined,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (:User {wallet: $wallet})-[:BOOKMARKED]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        MATCH (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost)
        WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
        AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        } AS result
      `,
        { wallet, ecosystem: ecosystem ?? null },
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

  async getUserAppliedJobs(
    wallet: string,
    ecosystem: string | undefined,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (:User {wallet: $wallet})-[:APPLIED_TO]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        MATCH (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost)
        WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
        AND NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
            }
          ][0],
            tags: apoc.coll.toSet(tags)
        } AS result
      `,
        { wallet, ecosystem: ecosystem ?? null },
      );

      return {
        success: true,
        message: "User applied jobs retrieved successfully",
        data: ecosystem
          ? (result.records
              ?.map(record =>
                new JobListResultEntity(record.get("result")).getProperties(),
              )
              .filter(job => job.organization.ecosystems.includes(ecosystem)) ??
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
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
              hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
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
                  ],
                  investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                  fundingRounds: [
                    (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                  ],
                  grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                    .*,
                    programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                  }]
                }
              ],
              fundingRounds: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ]),
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
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
              ],
              investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
              fundingRounds: [
                (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
              ],
              grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }]
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
        SET r.createdTimestamp = timestamp()
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
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost {shortUUID: $shortUUID})
        OPTIONAL MATCH (job)-[r:HAS_TAG]->(:Tag)
        DELETE r

        WITH job
        MATCH (tag:Tag WHERE tag.normalizedName IN $tags)
        MERGE (job)-[r:HAS_TAG]->(tag)
        SET r.creator = $wallet
        `,
        { ...dto, wallet },
      );

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
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost {shortUUID: $shortUUID}), (commitment:JobpostCommitment {name: $commitment})
        OPTIONAL MATCH (job)-[r:HAS_COMMITMENT]->(:JobpostCommitment)
        DELETE r

        WITH job, commitment
        MERGE (job)-[r:HAS_COMMITMENT]->(commitment)
        SET r.creator = $wallet
        `,
        { ...dto, wallet },
      );
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
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost {shortUUID: $shortUUID}), (locationType:JobpostLocationType {name: $locationType})
        OPTIONAL MATCH (job)-[r:HAS_LOCATION_TYPE]->(:JobpostLocationType)
        DELETE r

        WITH job, locationType
        MERGE (job)-[r:HAS_LOCATION_TYPE]->(locationType)
        SET r.creator = $wallet
        `,
        { ...dto, wallet },
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
        MATCH (job:StructuredJobpost {shortUUID: $shortUUID}), (project:Project {id: $projectId})
        OPTIONAL MATCH (job)-[r:HAS_PROJECT]->(:Project)
        DELETE r

        WITH job, project
        MERGE (job)-[r:HAS_PROJECT]->(project)
        SET r.creator = $wallet
        `,
        { ...dto, wallet },
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
  ): Promise<boolean> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost {shortUUID: $shortUUID})
        SET job.title = $title
        SET job.salary = $salary
        SET job.location = $location
        SET job.summary = $summary
        SET job.seniority = $seniority
        SET job.paysInCrypto = $paysInCrypto
        SET job.minimumSalary = $minimumSalary
        SET job.maximumSalary = $maximumSalary
        SET job.salaryCurrency = $salaryCurrency
        SET job.offersTokenAllocation = $offersTokenAllocation
        SET job.url = $url
        SET job.description = $description
        SET job.culture = $culture
        SET job.benefits = $benefits
        SET job.requirements = $requirements
        SET job.responsibilities = $responsibilities
        SET job.access = CASE WHEN $protected THEN "protected" ELSE "public" END
        SET job.onboardIntoWeb3 = $onboardIntoWeb3
        SET job.ethSeasonOfInternships = $ethSeasonOfInternships
      `,
        {
          shortUUID,
          ...job,
        },
      );
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
        SET r.createdTimestamp = timestamp()
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
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost WHERE job.shortUUID IN $shortUUIDs), (offline:JobpostOfflineStatus)
        OPTIONAL MATCH (job)-[r:HAS_STATUS]->()
        DELETE r  

        WITH job, offline
        MERGE (job)-[r:HAS_STATUS]->(offline)
        SET r.creator = $wallet
        `,
        {
          shortUUIDs: dto.shortUUIDs,
          wallet,
        },
      );
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
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost WHERE job.shortUUID IN $shortUUIDs), (online:JobpostOnlineStatus)
        OPTIONAL MATCH (job)-[r:HAS_STATUS]->()
        DELETE r

        WITH job, online
        MERGE (job)-[r:HAS_STATUS]->(online)
        SET r.creator = $wallet
        `,
        {
          shortUUIDs: dto.shortUUIDs,
          wallet,
        },
      );
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

  async featureJobpost(dto: FeatureJobsInput): Promise<ResponseWithNoData> {
    try {
      const { endDate, startDate } = dto;
      await this.neogma.queryRunner.run(
        `
        MATCH (job:StructuredJobpost {shortUUID: $shortUUID})
        SET job.featured = true
        SET job.featureStartDate = $startDate
        SET job.featureEndDate = $endDate
        `,
        {
          ...dto,
          startDate: new Date(startDate).getTime(),
          endDate: new Date(endDate).getTime(),
        },
      );
      return {
        success: true,
        message: "Job made featured successfully",
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
      this.logger.error(`JobsService::makeJobFeatured ${err.message}`);
      return {
        success: false,
        message: "Error making job featured",
      };
    }
  }

  async handleJobPromotion(shortUUID: string): Promise<void> {
    const job = await this.getJobDetailsByUuid(shortUUID, undefined);
    if (job) {
      const isAlreadyPromoted = job.featured;
      if (isAlreadyPromoted) {
        this.logger.log(
          `Job ${job.shortUUID} is already promoted, extending feature duration...`,
        );
        await this.featureJobpost({
          shortUUID: job.shortUUID,
          startDate: new Date(job.featureStartDate).toISOString(),
          endDate: addDays(job.featureEndDate, 7).toISOString(),
        });
      } else {
        this.logger.log(
          `Promoting job ${job.shortUUID} to featured status for a week...`,
        );
        await this.featureJobpost({
          shortUUID: job.shortUUID,
          startDate: new Date().toISOString(),
          endDate: addDays(new Date(), 7).toISOString(),
        });
      }
      this.logger.log(`Job ${job.shortUUID} promoted successfully`);
    } else {
      this.logger.error(
        `Job ${shortUUID} could not be promoted because it does not exist`,
      );
    }
  }
}
