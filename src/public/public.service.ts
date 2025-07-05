import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import {
  JobFilterConfigsEntity,
  JobListResultEntity,
} from "src/shared/entities";
import {
  slugify,
  paginate,
  notStringOrNull,
  publicationDateRangeGenerator,
  sprinkleProtectedJobs,
} from "src/shared/helpers";
import {
  FundingRound,
  JobFilterConfigs,
  JobListResult,
  PaginatedData,
  ProjectWithBaseRelations,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { differenceInHours } from "date-fns";
import { go } from "fuzzysort";
import { uniq } from "lodash";
import { DateRange } from "src/shared/enums";
import { ConfigService } from "@nestjs/config";
import { TagsService } from "src/tags/tags.service";

@Injectable()
export class PublicService {
  private readonly logger = new CustomLogger(PublicService.name);
  private FE_DOMAIN: string;
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly tagsService: TagsService,
    private readonly configService: ConfigService,
  ) {
    this.FE_DOMAIN = this.configService.getOrThrow<string>("FE_DOMAIN");
  }

  getAllJobsListResults = async (
    authenticated: boolean,
  ): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      CYPHER runtime = parallel
      MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      AND (CASE WHEN $authenticated = true THEN structured_jobpost.publishedTimestamp <= 1746057600000 ELSE structured_jobpost.access = "public" END)
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
          tags: apoc.coll.toSet(tags)
      } AS result
    `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery, { authenticated })
      ).records.map(record => record.get("result") as JobListResult);
      for (const result of resultSet) {
        results.push(new JobListResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "public.service",
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
    params: JobListParams,
    authenticated: boolean,
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
    } = paramsPassed;

    const results: JobListResult[] = [];

    try {
      const jobs = await this.getAllJobsListResults(authenticated);
      results.push(...jobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "public.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`PublicService::getAllJobsList ${err.message}`);
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

    const filtered = results.filter(jobFilters).map(x =>
      new JobListResultEntity(x).getProperties(job => ({
        ...job,
        url: authenticated
          ? job.access === "public"
            ? notStringOrNull(x.url)
            : `${this.FE_DOMAIN}/jobs/${x.shortUUID}/details`
          : `${this.FE_DOMAIN}/jobs/${x.shortUUID}/details`,
      })),
    );

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

  async getAllJobsFilterConfigs(
    ecosystem: string | null = null,
  ): Promise<JobFilterConfigs> {
    try {
      const popularity =
        this.configService.get<string>("SKILL_THRESHOLD") ?? null;
      const tags = (await this.tagsService.getPopularTags(100)).map(
        x => x.name,
      );
      const result = await this.neogma.queryRunner
        .run(
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
              ]),
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
              ]),
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
              chains: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain: Chain)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | chain.name
              ]),
              locations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | location.name
              ]),
              organizations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END | org.name
              ]),
              seniority: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
                AND j.seniority IS NOT NULL | j.seniority
              ])
            } as res
          `,
          { ecosystem, popularity },
        )
        .then(res =>
          res.records.length
            ? new JobFilterConfigsEntity({
                ...res.records[0].get("res"),
                tags,
              }).getProperties()
            : undefined,
        );
      return result;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "public.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `PublicService::getAllJobsFilterConfigs ${err.message}`,
      );
      return undefined;
    }
  }
}
