import { Client } from "pg";
import {
  JobSearchParams,
  SearchDocumentRepository,
} from "./search-document.repository";
import { PostgresService } from "./postgres.service";
import { sprinkleProtectedJobs } from "src/shared/helpers";
import { JobListOrderBy } from "src/shared/types";
import { parseHttpQuery } from "src/shared/helpers/http-query-parser";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { JobsController } from "src/jobs/jobs.controller";
import { JobsService } from "src/jobs/jobs.service";
import { TagsService } from "src/tags/tags.service";
import { UserService } from "src/user/user.service";
import { StripeService } from "src/stripe/stripe.service";
import { AccountService } from "src/auth/account/account.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { AuthService } from "src/auth/auth.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

const sorts: Record<JobListOrderBy, string> = {
  publicationDate: "published_timestamp",
  teamSize: "published_timestamp",
  salary: "salary",
  fundingDate: "COALESCE(latest_funding_timestamp, 0)",
  headcountEstimate: "COALESCE(headcount_estimate, 0)",
  tvl: "COALESCE(sort_project_tvl, 0)",
  monthlyVolume: "COALESCE(sort_project_monthly_volume, 0)",
  monthlyFees: "COALESCE(sort_project_monthly_fees, 0)",
  monthlyRevenue: "COALESCE(sort_project_monthly_revenue, 0)",
  audits: "COALESCE(sort_project_audit_count, 0)",
  hacks: "COALESCE(sort_project_hack_count, 0)",
  chains: "COALESCE(sort_project_chain_count, 0)",
};

describePostgres("materialized job filter query parity", () => {
  let client: Client;
  let repository: SearchDocumentRepository;
  let random: jest.SpyInstance;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
    });
    await client.connect();
    // Session-local copies exercise real SQL without touching canonical fixtures.
    await client.query(`
      CREATE TEMP TABLE job_search_documents (LIKE public.job_search_documents INCLUDING DEFAULTS);
      CREATE TEMP TABLE organization_search_documents (LIKE public.organization_search_documents INCLUDING DEFAULTS);
      CREATE TEMP TABLE project_search_documents (LIKE public.project_search_documents INCLUDING DEFAULTS);
    `);
    repository = new SearchDocumentRepository({
      query: async (sql: string, parameters: unknown[] = []) =>
        (await client.query(sql, parameters)).rows,
    } as unknown as PostgresService);
    random = jest.spyOn(Math, "random").mockReturnValue(0.37);
  });

  afterAll(async () => {
    random?.mockRestore();
    await client?.end();
  });

  it("serves the real guarded count HTTP route through service and PostgreSQL", async () => {
    await seed(31, 4);
    const service = new JobsService(
      undefined,
      undefined,
      undefined,
      undefined,
      repository,
      undefined,
      undefined,
      undefined,
    );
    const module = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobsService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            getSession: async (): Promise<{ permissions: string[] }> => ({
              permissions: [],
            }),
          },
        },
        ...[
          TagsService,
          UserService,
          StripeService,
          AccountService,
          ProfileService,
          SubscriptionsService,
        ].map(provide => ({ provide, useValue: {} })),
      ],
    }).compile();
    const app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set("query parser", parseHttpQuery);
    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .get("/jobs/count")
        .expect(200);
      expect(response.body).toEqual({ totalJobs: 35 });
      await client.query(
        "UPDATE job_search_documents SET blocked=true WHERE job_node_id=1",
      );
      await request(app.getHttpServer())
        .get("/jobs/count")
        .expect(200, { totalJobs: 34 });
      for (const query of [
        "organizationClassifications=invalid",
        "organizationClassifications[unexpected]=crypto",
        "minSalaryRange=-1",
        "maxSalaryRange=10&minSalaryRange=20",
        "page=Infinity",
        "orderBy=payload%3BDROP%20TABLE",
      ]) {
        await request(app.getHttpServer())
          .get(`/jobs/feed?${query}`)
          .expect(400);
      }
    } finally {
      await app.close();
    }
  });

  async function seed(
    publicCount: number,
    protectedCount: number,
  ): Promise<void> {
    await client.query("TRUNCATE job_search_documents");
    await client.query(
      `
      INSERT INTO job_search_documents (
        job_node_id, structured_jobpost_id, short_uuid, organization_id,
        title, access, online, tags, published_timestamp, salary,
        latest_funding_timestamp, headcount_estimate,
        sort_project_tvl, sort_project_monthly_volume, sort_project_monthly_fees,
        sort_project_monthly_revenue, sort_project_audit_count,
        sort_project_hack_count, sort_project_chain_count,
        featured, feature_start_timestamp, feature_end_timestamp, payload
      ) SELECT n, 'job-'||n, 'job-'||n, 'org-'||n,
        'Engineer '||n, CASE WHEN n <= $1 THEN 'public' ELSE 'protected' END,
        true, ARRAY['engineering'], CASE WHEN n%17=0 THEN NULL ELSE 1700000000000+n%11 END,
        CASE WHEN n%7=0 THEN NULL ELSE 100000+n%13 END,
        CASE WHEN n%7=0 THEN NULL ELSE 1600000000000+n%9 END,
        CASE WHEN n%7=0 THEN NULL ELSE (n%19)::integer END,
        n%23, n%29, n%31, n%37, (n%5)::integer, (n%3)::integer, (n%7)::integer,
        n%11=0, CASE WHEN n%22=0 THEN 1900000000000 ELSE 1600000000000+n%7 END,
        2100000000000+n%5,
        jsonb_build_object('id', 'job-'||n)
      FROM generate_series(1, $1::integer+$2::integer) n`,
      [publicCount, protectedCount],
    );
  }

  async function legacyCandidates(
    orderBy: JobListOrderBy,
    direction: "asc" | "desc",
  ): Promise<Array<{ job_node_id: string; access: "public" | "protected" }>> {
    return (
      await client.query(`WITH candidates AS (
      SELECT job_node_id, access,
        (featured AND feature_start_timestamp IS NOT NULL
          AND feature_end_timestamp IS NOT NULL
          AND feature_start_timestamp < (extract(epoch FROM statement_timestamp())*1000)::bigint
          AND feature_end_timestamp > (extract(epoch FROM statement_timestamp())*1000)::bigint) AS featured,
        feature_start_timestamp, feature_end_timestamp,
        ${sorts[orderBy]} AS sort_value
      FROM job_search_documents
    ) SELECT * FROM candidates ORDER BY featured DESC,
      CASE WHEN featured THEN feature_start_timestamp END ASC NULLS LAST,
      CASE WHEN featured THEN feature_end_timestamp-feature_start_timestamp END DESC NULLS LAST,
      sort_value ${direction} NULLS LAST, job_node_id`)
    ).rows as Array<{
      job_node_id: string;
      access: "public" | "protected";
    }>;
  }

  it.each([
    [0, 0],
    [0, 5],
    [5, 0],
    [5, 17],
    [200, 1],
    [1, 250],
    [120, 140],
    [500, 260],
  ])(
    "preserves randomized window and every tail slice for public=%i protected=%i",
    async (publicCount, protectedCount) => {
      await seed(publicCount, protectedCount);
      for (const jitter of [0, 0.37, 0.999999]) {
        random.mockReturnValue(jitter);
        const all = sprinkleProtectedJobs(
          await legacyCandidates("publicationDate", "desc"),
        );
        for (const [page, limit] of [
          [1, 10],
          [10, 10],
          [20, 10],
          [21, 10],
          [30, 10],
          [2, 123],
          [-1, 2],
          [0, 10],
          [1.5, 7],
          [1, 0],
          [1, 5000],
          [999, 10],
        ]) {
          const expected =
            page > Math.ceil(all.length / limit)
              ? []
              : all.slice((page - 1) * limit, page * limit);
          const actual = await repository.searchJobs({ page, limit });
          expect(actual.total).toBe(all.length);
          expect(actual.data.map(job => job.id)).toEqual(
            expected.map(job => `job-${job.job_node_id}`),
          );
        }
      }
    },
  );

  it.each(Object.keys(sorts) as JobListOrderBy[])(
    "preserves %s nulls, ties and featured precedence in both directions",
    async orderBy => {
      await seed(240, 31);
      for (const order of ["asc", "desc"] as const) {
        const all = sprinkleProtectedJobs(
          await legacyCandidates(orderBy, order),
        );
        for (const page of [1, 12, 24]) {
          const actual = await repository.searchJobs({
            orderBy,
            order,
            page,
            limit: 10,
          });
          expect(actual.total).toBe(all.length);
          expect(actual.data.map(job => job.id)).toEqual(
            all
              .slice((page - 1) * 10, page * 10)
              .map(job => `job-${job.job_node_id}`),
          );
        }
      }
    },
  );

  it("retains complete fuzzy candidates, including matches beyond the first page", async () => {
    await seed(300, 7);
    await client.query(`UPDATE job_search_documents SET search_values =
      CASE WHEN job_node_id % 2 = 0 THEN ARRAY['Protocol Engineer'] ELSE ARRAY['Designer'] END`);
    const expected = sprinkleProtectedJobs(
      (await legacyCandidates("publicationDate", "desc")).filter(
        job => Number(job.job_node_id) % 2 === 0,
      ),
    );
    const result = await repository.searchJobs({
      query: "protocol engineer",
      limit: 5000,
    });
    expect(result.total).toBe(expected.length);
    expect(result.data.map(job => job.id)).toEqual(
      expected.map(job => `job-${job.job_node_id}`),
    );
  });

  it("applies every projected list predicate with OR lists and AND intersections", async () => {
    await seed(2, 0);
    await client.query(`UPDATE job_search_documents SET tags=ARRAY['other'];
      UPDATE job_search_documents SET employer_vertical='crypto',
        organization_name_key='selected-employer', funding_stage_key='seed',
        tags=ARRAY['solidity'], project_names=ARRAY['protocol'],
        investor_names=ARRAY['investor'], funding_round_names=ARRAY['series-a'],
        chain_names=ARRAY['ethereum'], ecosystems=ARRAY['defi'],
        managed_ecosystems=ARRAY['managed'], classifications=ARRAY['engineering-management'],
        classification_compat_keys=ARRAY['engineering-management','engineeringmanagement'],
        commitments=ARRAY['fulltime'], seniority='3',
        work_mode_keys=ARRAY['remote','fully-remote'], strict_fully_remote=true,
        availability_filter_keys=ARRAY['place:amsterdam','amsterdam'],
        city_filter_keys=ARRAY['place:amsterdam','amsterdam'],
        region_filter_keys=ARRAY['europe'], country_filter_keys=ARRAY['netherlands'],
        continent_filter_keys=ARRAY['europe'], timezone_filter_keys=ARRAY['tz:Europe/Amsterdam'],
        collaboration_hour_keys=ARRAY['utc-08'], pays_in_crypto='true',
        offers_token_allocation='true', recently_funded=true, onboard_into_web3=true,
        has_token=true, has_hacks=true, has_audits=true, access='protected',
        title='Distinct technical clerk'
      WHERE job_node_id=1`);
    const cases: JobSearchParams[] = [
      { organizationId: "org-1" },
      { organizations: ["selected-employer"] },
      { organizationClassifications: ["crypto"] },
      { tags: ["solidity", "missing"] },
      { projects: ["protocol"] },
      { investors: ["investor"] },
      { fundingRounds: ["Series A"] },
      { fundingStages: ["seed"] },
      { chains: ["ethereum"] },
      { ecosystems: ["defi"] },
      { ecosystems: ["managed"] },
      { ecosystemHeader: "managed" },
      { classifications: ["engineeringmanagement"] },
      { commitments: ["Full Time"] },
      { seniority: ["3"] },
      { workModes: ["remote"] },
      { workModes: ["fully-remote"] },
      { availability: ["amsterdam"] },
      { cities: ["place:amsterdam"] },
      { regions: ["europe"] },
      { countries: ["netherlands"] },
      { continents: ["europe"] },
      { timezones: ["tz:Europe/Amsterdam"] },
      { collaborationHours: ["utc-08"] },
      { paysInCrypto: true },
      { offersTokenAllocation: true },
      { recentlyFunded: true },
      { onboardIntoWeb3: true },
      { audits: true },
      { hacks: true },
      { token: true },
      { expertJobs: true },
      { teamOrganizationIds: ["org-1"] },
      { titleQuery: "technical clerk" },
    ];
    for (const filters of cases) {
      const result = await repository.searchJobs(filters);
      expect({
        filters,
        total: result.total,
        ids: result.data.map(job => job.id),
      }).toEqual({ filters, total: 1, ids: ["job-1"] });
      expect(
        (
          await repository.searchJobs({
            ...filters,
            pillarCriteria: { tags: ["other"] },
          })
        ).total,
      ).toBe(0);
      expect((await repository.searchJobGroups(filters)).totalJobs).toBe(1);
    }
    expect(
      (await repository.searchJobs({ tags: ["solidity", "other"] })).total,
    ).toBe(2);
    expect(
      (await repository.searchJobs({ teamOrganizationIds: [] })).total,
    ).toBe(0);
    expect(
      (
        await repository.searchJobs({
          organizationClassifications: ["unclassified"],
        })
      ).total,
    ).toBe(0);
  });

  it("preserves all numeric bounds, null handling, currency and date boundaries", async () => {
    await seed(2, 0);
    await client.query(`UPDATE job_search_documents SET salary=NULL, headcount_estimate=NULL;
      UPDATE job_search_documents SET salary=100, salary_currency='USD',
        headcount_estimate=100, max_tvl=100, min_tvl=100,
        max_monthly_volume=100, min_monthly_volume=100,
        max_monthly_fees=100, min_monthly_fees=100,
        max_monthly_revenue=100, min_monthly_revenue=100
      WHERE job_node_id=1`);
    for (const [minimum, maximum] of [
      ["minSalaryRange", "maxSalaryRange"],
      ["minHeadCount", "maxHeadCount"],
      ["minTvl", "maxTvl"],
      ["minMonthlyVolume", "maxMonthlyVolume"],
      ["minMonthlyFees", "maxMonthlyFees"],
      ["minMonthlyRevenue", "maxMonthlyRevenue"],
    ]) {
      expect(
        (await repository.searchJobs({ [minimum]: 100, [maximum]: 101 })).total,
      ).toBe(1);
      expect((await repository.searchJobs({ [minimum]: 101 })).total).toBe(0);
      expect(
        (await repository.searchJobs({ [minimum]: 100, [maximum]: 100 })).total,
      ).toBe(0);
      expect(
        (await repository.searchJobs({ [minimum]: 0, [maximum]: 0 })).total,
      ).toBe(2);
    }
    await client.query(
      "UPDATE job_search_documents SET salary_currency='EUR' WHERE job_node_id=1",
    );
    expect((await repository.searchJobs({ minSalaryRange: 100 })).total).toBe(
      0,
    );
    expect(
      (
        await repository.searchJobs({
          startDate: 1700000000001,
          endDate: 1700000000002,
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await repository.searchJobs({
          startDate: 1700000000002,
          endDate: 1700000000002,
        })
      ).total,
    ).toBe(0);
  });

  it("shares exact global feed/count eligibility including null dates and rejected employer states", async () => {
    await seed(30, 4);
    await client.query(`UPDATE job_search_documents SET
      online = job_node_id <> 1, blocked = job_node_id = 2,
      legacy_list_eligible = job_node_id <> 3,
      tags = CASE WHEN job_node_id=4 THEN ARRAY[]::text[] ELSE tags END,
      project_id = CASE WHEN job_node_id=5 THEN 'ambiguous-project' END,
      organization_id = CASE WHEN job_node_id=6 THEN NULL ELSE organization_id END,
      organization_has_expert_jobs = job_node_id=7,
      published_timestamp = CASE WHEN job_node_id=8 THEN 4100000000000 ELSE published_timestamp END`);
    const count = await repository.getJobCount();
    const grouped = await repository.searchJobGroups({});
    expect(count.totalJobs).toBe(26);
    expect(grouped.totalJobs).toBe(count.totalJobs);
    expect(grouped.total).toBe(26);
  });
});
