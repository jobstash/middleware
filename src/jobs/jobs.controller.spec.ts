import { Test, TestingModule } from "@nestjs/testing";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobListParams } from "./dto/job-list.input";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import {
  AllJobsFilterConfigs,
  DateRange,
  JobFilterConfigs,
  JobListResult,
  AllJobsListResult,
  Project,
} from "src/shared/types";
import { Integer } from "neo4j-driver";
import {
  hasDuplicates,
  printDuplicateItems,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { CacheModule } from "@nestjs/cache-manager";
import { Response } from "express";
import { ModelModule } from "src/model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { ModelService } from "src/model/model.service";

describe("JobsController", () => {
  let controller: JobsController;
  let models: ModelService;

  const projectHasArrayPropsDuplication = (
    project: Project,
    jobPostUUID: string,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      a => a.id,
      `Audit for Project ${project.id} for Jobpost ${jobPostUUID}`,
    );
    const hasDuplicateHacks = hasDuplicates(
      project.hacks,
      h => h.id,
      `Hack for Project ${project.id} for Jobpost ${jobPostUUID}`,
    );
    const hasDuplicateChains = hasDuplicates(
      project.chains,
      c => c.id,
      `Chain for Project ${project.id} for Jobpost ${jobPostUUID}`,
    );
    expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    return hasDuplicateAudits && hasDuplicateHacks && hasDuplicateChains;
  };

  const jlrHasArrayPropsDuplication = (
    jobListResult: JobListResult,
  ): boolean => {
    const hasDuplicateProjects = hasDuplicates(
      jobListResult.organization.projects,
      p => p.id,
      `Org Projects for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateTechs = hasDuplicates(
      jobListResult.technologies,
      x => x.id,
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateInvestors = hasDuplicates(
      jobListResult.organization.investors,
      i => i.id,
      `Investor for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateFundingRounds = hasDuplicates(
      jobListResult.organization.fundingRounds,
      x => x.id,
      `Org Funding Rounds for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasProjectsWithUniqueProps =
      jobListResult.organization.projects.every(
        x =>
          projectHasArrayPropsDuplication(x, jobListResult.shortUUID) === false,
      ) === true;
    expect(hasDuplicateProjects).toBe(false);
    expect(hasDuplicateTechs).toBe(false);
    expect(hasDuplicateInvestors).toBe(false);
    expect(hasDuplicateFundingRounds).toBe(false);
    expect(hasProjectsWithUniqueProps).toBe(true);
    return (
      hasDuplicateProjects &&
      hasDuplicateTechs &&
      hasDuplicateInvestors &&
      hasDuplicateFundingRounds &&
      hasProjectsWithUniqueProps
    );
  };

  const ajlrHasArrayPropsDuplication = (
    jobListResult: AllJobsListResult,
  ): boolean => {
    const hasDuplicateTechs = hasDuplicates(
      jobListResult.technologies,
      x => x.id,
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
    );
    expect(hasDuplicateTechs).toBe(false);
    return hasDuplicateTechs;
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envSchema,
          validationOptions: {
            abortEarly: true,
          },
        }),
        NeogmaModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) =>
            ({
              host: configService.get<string>("NEO4J_HOST"),
              password: configService.get<string>("NEO4J_PASSWORD"),
              port: configService.get<string>("NEO4J_PORT"),
              scheme: configService.get<string>("NEO4J_SCHEME"),
              username: configService.get<string>("NEO4J_USERNAME"),
              database: configService.get<string>("NEO4J_DATABASE"),
            } as NeogmaModuleOptions),
        }),
        CacheModule.register({ isGlobal: true }),
        ModelModule,
      ],
      controllers: [JobsController],
      providers: [JobsService, ModelService],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<JobsController>(JobsController);
  }, 1000000);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should be able to access models", async () => {
    expect(models.Organizations.findMany).toBeDefined();
    expect(
      (await models.Organizations.findMany()).length,
    ).toBeGreaterThanOrEqual(1);
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

    expect(uuids.length).toBe(setOfUuids.size);

    expect(res.data.every(x => jlrHasArrayPropsDuplication(x) === false)).toBe(
      true,
    );
  }, 6000000);

  it("should get all jobs list with no jobpost and array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    const res = await controller.getAllJobsWithSearch(params);

    const uuids = res.data.map(job => job.shortUUID);
    const setOfUuids = new Set([...uuids]);

    expect(res).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<JobListResult>),
    });

    printDuplicateItems(setOfUuids, uuids, "StructuredJobpost with UUID");

    expect(uuids.length).toBe(setOfUuids.size);

    expect(res.data.every(x => ajlrHasArrayPropsDuplication(x) === false)).toBe(
      true,
    );
  }, 60000000);

  it("should get job details with no array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: 1,
    };

    const job = (await controller.getJobsListWithSearch(params)).data[0];

    const res: Partial<Response> = {};

    const details = await controller.getJobDetailsByUuid(
      job.shortUUID,
      res as Response,
    );

    expect(jlrHasArrayPropsDuplication(details)).toBe(false);
  }, 60000000);

  it("should respond with the correct page ", async () => {
    const page = 1;
    const params: JobListParams = {
      ...new JobListParams(),
      page: page,
      limit: 1,
    };

    const res = await controller.getJobsListWithSearch(params);

    expect(res.page).toEqual(page);
  }, 1000000000);

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
      report(validationResult).forEach(x => {
        throw new Error(x);
      });
    }
  }, 100000);

  it("should get correctly formatted all jobs filter configs", async () => {
    const configs = await controller.getAllJobsListFilterConfigs();

    expect(configs).toBeDefined();

    const validationResult =
      AllJobsFilterConfigs.AllJobsFilterConfigsType.decode(configs);
    if (isRight(validationResult)) {
      // The result is of the expected type
      const validatedResult = validationResult.right;
      expect(validatedResult).toEqual(configs);
    } else {
      // The result is not of the expected type
      report(validationResult).forEach(x => {
        throw new Error(x);
      });
    }
  }, 100000);
});
