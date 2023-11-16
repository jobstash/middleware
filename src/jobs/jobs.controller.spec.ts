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
  ProjectWithRelations,
} from "src/shared/types";
import { Integer } from "neo4j-driver";
import {
  hasDuplicates,
  printDuplicateItems,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Request, Response } from "express";
import { ModelModule } from "src/model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { forwardRef } from "@nestjs/common";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "src/auth/profile/profile.service";

describe("JobsController", () => {
  let controller: JobsController;
  let models: ModelService;
  let authService: AuthService;

  const projectHasArrayPropsDuplication = (
    project: ProjectWithRelations,
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
      jobListResult.tags,
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
      jobListResult.tags,
      x => x.id,
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
    );
    expect(hasDuplicateTechs).toBe(false);
    return hasDuplicateTechs;
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        forwardRef(() => UserModule),
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
        ModelModule,
      ],
      controllers: [JobsController],
      providers: [
        JobsService,
        AuthService,
        JwtService,
        ModelService,
        ProfileService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<JobsController>(JobsController);
    authService = module.get<AuthService>(AuthService);
  }, 1000000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should be able to access models", async () => {
    expect(models.Organizations.findMany).toBeDefined();
    expect(
      (await models.Organizations.findMany()).length,
    ).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("should get jobs list with no jobpost and array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    jest.spyOn(authService, "getSession").mockImplementation(async () => ({
      address: "0xbDc6A3B4A6f9C18Dc2a12b006133E2bbcD81Fe61",
      destroy: async (): Promise<void> => {
        console.log("session destroyed");
      },
      save: async (): Promise<void> => {
        console.log("session saved");
      },
    }));
    const req: Partial<Request> = {};
    const res: Partial<Response> = {};
    const result = await controller.getJobsListWithSearch(
      req as Request,
      res as Response,
      params,
    );

    const uuids = result.data.map(job => job.shortUUID);
    const setOfUuids = new Set([...uuids]);

    expect(result).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<JobListResult>),
    });

    printDuplicateItems(setOfUuids, uuids, "StructuredJobpost with UUID");

    expect(uuids.length).toBe(setOfUuids.size);

    expect(
      result.data.every(x => jlrHasArrayPropsDuplication(x) === false),
    ).toBe(true);
  }, 6000000);

  it("should get all jobs list with no jobpost and array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    jest.spyOn(authService, "getSession").mockImplementation(async () => ({
      address: "0xbDc6A3B4A6f9C18Dc2a12b006133E2bbcD81Fe61",
      destroy: async (): Promise<void> => {
        console.log("session destroyed");
      },
      save: async (): Promise<void> => {
        console.log("session saved");
      },
    }));
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
    jest.spyOn(authService, "getSession").mockImplementation(async () => ({
      address: "0xbDc6A3B4A6f9C18Dc2a12b006133E2bbcD81Fe61",
      destroy: async (): Promise<void> => {
        console.log("session destroyed");
      },
      save: async (): Promise<void> => {
        console.log("session saved");
      },
    }));

    const req: Partial<Request> = {};
    const res: Partial<Response> = {};
    const job = (
      await controller.getJobsListWithSearch(
        req as Request,
        res as Response,
        params,
      )
    ).data[0];

    const details = await controller.getJobDetailsByUuid(
      job.shortUUID,
      req as Request,
      res as Response,
    );

    expect(jlrHasArrayPropsDuplication(details)).toBe(false);
  }, 60000000);

  it("should get job for an org with no array property duplication", async () => {
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: 1,
    };

    const req: Partial<Request> = {};
    const res: Partial<Response> = {};
    jest.spyOn(authService, "getSession").mockImplementation(async () => ({
      address: "0xbDc6A3B4A6f9C18Dc2a12b006133E2bbcD81Fe61",
      destroy: async (): Promise<void> => {
        console.log("session destroyed");
      },
      save: async (): Promise<void> => {
        console.log("session saved");
      },
    }));
    const job = (
      await controller.getJobsListWithSearch(
        req as Request,
        res as Response,
        params,
      )
    ).data[0];

    const details = await controller.getOrgJobsList(job.organization.orgId);

    const uuids = details.map(job => job.shortUUID);
    const setOfUuids = new Set([...uuids]);

    printDuplicateItems(setOfUuids, uuids, "StructuredJobpost with UUID");

    expect(uuids.length).toBe(setOfUuids.size);

    expect(details.every(x => jlrHasArrayPropsDuplication(x) === false)).toBe(
      true,
    );
  }, 60000000);

  it("should respond with the correct page ", async () => {
    const page = 1;
    const params: JobListParams = {
      ...new JobListParams(),
      page: page,
      limit: 1,
    };
    jest.spyOn(authService, "getSession").mockImplementation(async () => ({
      address: "0xbDc6A3B4A6f9C18Dc2a12b006133E2bbcD81Fe61",
      destroy: async (): Promise<void> => {
        console.log("session destroyed");
      },
      save: async (): Promise<void> => {
        console.log("session saved");
      },
    }));

    const req: Partial<Request> = {};
    const res: Partial<Response> = {};
    const result = await controller.getJobsListWithSearch(
      req as Request,
      res as Response,
      params,
    );

    expect(result.page).toEqual(page);
  }, 1000000000);

  it("should respond with the correct results for publicationDate filter", async () => {
    const dateRange: DateRange = "this-week";
    const params: JobListParams = {
      ...new JobListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      publicationDate: dateRange,
    };
    jest.spyOn(authService, "getSession").mockImplementation(async () => ({
      address: "0xbDc6A3B4A6f9C18Dc2a12b006133E2bbcD81Fe61",
      destroy: async (): Promise<void> => {
        console.log("session destroyed");
      },
      save: async (): Promise<void> => {
        console.log("session saved");
      },
    }));

    const matchesPublicationDateRange = (
      jobListResult: JobListResult,
    ): boolean => {
      const { startDate, endDate } = publicationDateRangeGenerator(dateRange);
      return (
        startDate <= jobListResult.timestamp &&
        jobListResult.timestamp <= endDate
      );
    };

    const req: Partial<Request> = {};
    const res: Partial<Response> = {};
    const result = await controller.getJobsListWithSearch(
      req as Request,
      res as Response,
      params,
    );
    const results = result.data;
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
      const validatedResult = validationResult.right;
      expect(validatedResult).toEqual(configs);
    } else {
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
      const validatedResult = validationResult.right;
      expect(validatedResult).toEqual(configs);
    } else {
      report(validationResult).forEach(x => {
        throw new Error(x);
      });
    }
  }, 100000);
});
