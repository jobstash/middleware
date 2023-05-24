import { Test, TestingModule } from "@nestjs/testing";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobListParams } from "./dto/job-list.input";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Neo4jConnection, Neo4jModule } from "nest-neo4j/dist";
import envSchema from "src/env-schema";
import {
  DateRange,
  JobFilterConfigs,
  JobListResult,
  Project,
} from "src/shared/types";
import { Integer } from "neo4j-driver";
import {
  inferObjectType,
  jlrHasArrayPropsDuplication,
  printDuplicateItems,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";

describe("JobsController", () => {
  let controller: JobsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envSchema,
          validationOptions: {
            abortEarly: true,
          },
        }),
        Neo4jModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) =>
            ({
              host: configService.get<string>("NEO4J_HOST"),
              password: configService.get<string>("NEO4J_PASSWORD"),
              port: configService.get<string>("NEO4J_PORT"),
              scheme: configService.get<string>("NEO4J_SCHEME"),
              username: configService.get<string>("NEO4J_USERNAME"),
            } as Neo4jConnection),
        }),
      ],
      controllers: [JobsController],
      providers: [JobsService],
    }).compile();

    controller = module.get<JobsController>(JobsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should get jobs list with no jobpost and array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    const res = await controller.getJobsListWithSearch(params);

    const uuids = res.data.map(job => job.shortUUID);
    const setOfUuids = new Set([...uuids]);

    expect(res).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<JobListResult>),
    });

    printDuplicateItems(setOfUuids, uuids, "StructuredJobpost with UUID");

    expect(setOfUuids.size).toBe(uuids.length);

    expect(res.data.every(x => jlrHasArrayPropsDuplication(x) === false)).toBe(
      true,
    );
  }, 300000);

  it("should get job details with no array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: 1,
    };

    const job = (await controller.getJobsListWithSearch(params)).data[0];

    const details = await controller.getJobDetailsByUuid(job.shortUUID);

    expect(job).toEqual(details);

    expect(jlrHasArrayPropsDuplication(job)).toBe(false);
  }, 10000);

  it("should respond with the correct page ", async () => {
    const page = 1;
    const params: JobListParams = {
      ...new JobListParams(),
      page: page,
      limit: 1,
    };

    const res = await controller.getJobsListWithSearch(params);

    expect(res.page).toEqual(page);
  }, 10000);

  it("should respond with the correct results for publicationDate filter", async () => {
    const dateRange: DateRange = "this-week";
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      publicationDate: dateRange,
    };

    const matchesPublicationDateRange = (
      jobListResult: JobListResult,
    ): boolean => {
      const { startDate, endDate } = publicationDateRangeGenerator(dateRange);
      return (
        startDate <= jobListResult.jobCreatedTimestamp &&
        jobListResult.jobCreatedTimestamp <= endDate
      );
    };

    const res = await controller.getJobsListWithSearch(params);
    const results = res.data;
    expect(results.every(x => matchesPublicationDateRange(x) === true)).toBe(
      true,
    );
  }, 1000000);

  it("should respond with the correct results for {(min & max)SalaryRange} filter", async () => {
    const minSalaryRange = 1000;
    const maxSalaryRange = 2000000;
    const params: JobListParams = {
      ...new JobListParams(),
      minSalaryRange,
      maxSalaryRange,
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      order: "asc",
      orderBy: "salary",
    };

    const matchesSalaryRange = (jobListResult: JobListResult): boolean => {
      return (
        minSalaryRange <= jobListResult.medianSalary &&
        jobListResult.medianSalary <= maxSalaryRange
      );
    };

    const res = await controller.getJobsListWithSearch(params);
    const results = res.data;
    expect(results.every(x => matchesSalaryRange(x) === true)).toBe(true);
  }, 1000000);

  it("should respond with the correct results for {(min & max)MonthlyFees} filter", async () => {
    const minMonthlyFees = 1000;
    const maxMonthlyFees = 2000000;
    const params: JobListParams = {
      ...new JobListParams(),
      minMonthlyFees,
      maxMonthlyFees,
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      order: "asc",
      orderBy: "monthlyFees",
    };

    const matchesMonthlyFeeRange = (anchorProject: Project): boolean => {
      return (
        minMonthlyFees <= anchorProject.monthlyFees &&
        anchorProject.monthlyFees <= maxMonthlyFees
      );
    };

    const res = await controller.getJobsListWithSearch(params);
    const results = res.data;
    expect(results.every(x => x.organization.projects.length > 0)).toBe(true);
    expect(
      results.every(x => {
        const anchorProject = x.organization.projects.sort(
          (a, b) => a.monthlyVolume - b.monthlyVolume,
        )[0];
        return matchesMonthlyFeeRange(anchorProject) === true;
      }),
    ).toBe(true);
  }, 1000000);

  it("should respond with the correct results for {(min & max)monthlyRevenue} filter", async () => {
    const minMonthlyRevenue = 1000;
    const maxMonthlyRevenue = 2000000;
    const params: JobListParams = {
      ...new JobListParams(),
      minMonthlyRevenue,
      maxMonthlyRevenue,
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      order: "asc",
      orderBy: "monthlyRevenue",
    };

    const matchesMonthlyRevenueRange = (anchorProject: Project): boolean => {
      return (
        minMonthlyRevenue <= anchorProject.monthlyRevenue &&
        anchorProject.monthlyRevenue <= maxMonthlyRevenue
      );
    };

    const res = await controller.getJobsListWithSearch(params);
    const results = res.data;
    expect(results.every(x => x.organization.projects.length > 0)).toBe(true);
    expect(
      results.every(x => {
        const anchorProject = x.organization.projects.sort(
          (a, b) => a.monthlyVolume - b.monthlyVolume,
        )[0];
        return matchesMonthlyRevenueRange(anchorProject) === true;
      }),
    ).toBe(true);
  }, 1000000);

  it("should respond with the correct results for {(min & max)Audits} filter", async () => {
    const minAudits = 1;
    const maxAudits = 10;
    const params: JobListParams = {
      ...new JobListParams(),
      minAudits,
      maxAudits,
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      order: "asc",
      orderBy: "audits",
    };

    const matchesAuditRange = (anchorProject: Project): boolean => {
      return (
        minAudits <= anchorProject.audits.length &&
        anchorProject.audits.length <= maxAudits
      );
    };

    const res = await controller.getJobsListWithSearch(params);
    const results = res.data;
    expect(results.every(x => x.organization.projects.length > 0)).toBe(true);
    expect(
      results.every(x => {
        const anchorProject = x.organization.projects.sort(
          (a, b) => a.monthlyVolume - b.monthlyVolume,
        )[0];
        return matchesAuditRange(anchorProject) === true;
      }),
    ).toBe(true);
  }, 1000000);

  it("should get correctly formatted filter configs", async () => {
    const configs = await controller.getFilterConfigs();

    expect(configs).toBeDefined();

    const validationResult =
      JobFilterConfigs.JobFilterConfigsType.decode(configs);
    if (isRight(validationResult)) {
      // The result is of the expected type
      const validatedResult = validationResult.right;
      expect(validatedResult).toEqual(configs);
    } else {
      // The result is not of the expected type
      throw new Error(
        `Error Serializing JobFilterConfigs! Constructor expected: \n {
          tvl: RangeFilter,
          salary: RangeFilter,
          audits: RangeFilter,
          teamSize: RangeFilter,
          headCount: RangeFilter,
          monthlyFees: RangeFilter,
          hacks: SingleSelectFilter,
          token: SingleSelectFilter,
          order: SingleSelectFilter,
          monthlyVolume: RangeFilter,
          monthlyRevenue: RangeFilter,
          mainNet: SingleSelectFilter,
          orderBy: SingleSelectFilter,
          seniority: MultiSelectFilter,
          locations: MultiSelectFilter,
          tech: MultiSelectSearchFilter,
          chains: MultiSelectSearchFilter,
          projects: MultiSelectSearchFilter,
          investors: MultiSelectSearchFilter,
          publicationDate: SingleSelectFilter,
          categories: MultiSelectSearchFilter,
          fundingRounds: MultiSelectSearchFilter,
          organizations: MultiSelectSearchFilter,
        } got ${inferObjectType(configs)}`,
      );
    }
  }, 100000);
});
