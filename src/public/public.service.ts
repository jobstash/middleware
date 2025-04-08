import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import {
  AllJobsFilterConfigsEntity,
  JobListResultEntity,
} from "src/shared/entities";
import { slugify, paginate } from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  JobListResult,
  PaginatedData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AllJobsInput } from "./dto/all-jobs.input";

@Injectable()
export class PublicService {
  private readonly logger = new CustomLogger(PublicService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  getAllJobsListResults = async (): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      AND structured_jobpost.access = "public"
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
              grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                .*,
                programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
              }],
              investors: apoc.coll.toSet([
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]),
              community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
              ecosystems: [
                (organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name
              ],
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
      this.logger.error(
        `PublicService::getAllJobsListWithSearch ${err.message}`,
      );
    }

    return results;
  };

  async getAllJobsList(
    params: AllJobsInput,
  ): Promise<PaginatedData<JobListResult>> {
    const paramsPassed = {
      ...params,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const {
      organizations: organizationFilterList,
      category: categoryFilterList,
      page,
      limit,
    } = paramsPassed;

    const results: JobListResult[] = [];

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
      this.logger.error(
        `PublicService::getAllJobsListWithSearch ${err.message}`,
      );
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const jobFilters = (job: JobListResult): boolean => {
      const { name: orgName } = job.organization;
      const category = job.classification;

      return (
        (!organizationFilterList ||
          organizationFilterList.includes(slugify(orgName))) &&
        (!categoryFilterList || categoryFilterList.includes(slugify(category)))
      );
    };

    const filtered = results.filter(jobFilters);

    const final = sort<JobListResult>(filtered).desc(job => job.timestamp);

    return paginate<JobListResult>(
      page,
      limit,
      final.map(x => new JobListResultEntity(x).getProperties()),
    );
  }

  async getAllJobsFilterConfigs(): Promise<AllJobsFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
            CYPHER runtime = pipelined
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
}
