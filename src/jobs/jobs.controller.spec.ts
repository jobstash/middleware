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
  resetTestDB,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Request, Response } from "express";
import { ModelModule } from "src/model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import { AuthService } from "src/auth/auth.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { forwardRef } from "@nestjs/common";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "src/auth/profile/profile.service";
import { TagsService } from "src/tags/tags.service";
import {
  DEV_TEST_WALLET,
  EPHEMERAL_TEST_WALLET,
  REALLY_LONG_TIME,
} from "src/shared/constants";
import { HttpModule, HttpService } from "@nestjs/axios";
import * as https from "https";
import { CustomLogger } from "src/shared/utils/custom-logger";

describe("JobsController", () => {
  let controller: JobsController;
  let models: ModelService;
  let authService: AuthService;
  let httpService: HttpService;

  const logger = new CustomLogger(`${JobsController.name}TestSuite`);

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
      x => x.normalizedName,
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
      x => x.normalizedName,
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
              host: configService.get<string>("NEO4J_HOST_TEST"),
              password: configService.get<string>("NEO4J_PASSWORD_TEST"),
              port: configService.get<string>("NEO4J_PORT_TEST"),
              scheme: configService.get<string>("NEO4J_SCHEME_TEST"),
              username: configService.get<string>("NEO4J_USERNAME_TEST"),
              database: configService.get<string>("NEO4J_DATABASE_TEST"),
              retryAttempts: 5,
              retryDelay: 1000,
            } as NeogmaModuleOptions),
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>("JWT_SECRET"),
            signOptions: {
              expiresIn: configService.get<string>("JWT_EXPIRES_IN"),
            },
          }),
        }),
        ModelModule,
        HttpModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            headers: {
              "X-Secret-Key": configService.get<string>(
                "TEST_DB_MANAGER_API_KEY",
              ),
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: REALLY_LONG_TIME,
            baseURL: configService.get<string>("TEST_DB_MANAGER_URL"),
          }),
        }),
      ],
      controllers: [JobsController],
      providers: [
        JobsService,
        TagsService,
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
    httpService = module.get<HttpService>(HttpService);
  }, REALLY_LONG_TIME);

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.restoreAllMocks();
  }, REALLY_LONG_TIME);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it(
    "should access models",
    async () => {
      expect(models.Organizations.findMany).toBeDefined();
      expect(
        (await models.Organizations.findMany()).length,
      ).toBeGreaterThanOrEqual(1);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get jobs list with no jobpost and array property duplication",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: Number(Integer.MAX_VALUE),
      };
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: DEV_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
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
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get all jobs list with no jobpost and array property duplication",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: Number(Integer.MAX_VALUE),
      };
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const res = await controller.getAllJobsWithSearch(params);

      const uuids = res.data.map(job => job.shortUUID);
      const setOfUuids = new Set([...uuids]);

      expect(res).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<JobListResult>),
      });

      printDuplicateItems(setOfUuids, uuids, "StructuredJobpost with UUID");

      expect(uuids.length).toBe(setOfUuids.size);

      expect(
        res.data.every(x => ajlrHasArrayPropsDuplication(x) === false),
      ).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get job details with no array property duplication",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 1,
      };
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
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
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get job for an org with no array property duplication",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 1,
      };

      const req: Partial<Request> = {};
      const res: Partial<Response> = {};
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
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
    },
    REALLY_LONG_TIME,
  );

  it(
    "should respond with the correct page ",
    async () => {
      const page = 1;
      const params: JobListParams = {
        ...new JobListParams(),
        page: page,
        limit: 1,
      };
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
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
    },
    REALLY_LONG_TIME,
  );

  it(
    "should respond with the correct results for publicationDate filter",
    async () => {
      const dateRange: DateRange = "this-week";
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: Number(Integer.MAX_VALUE),
        publicationDate: dateRange,
      };
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
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
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get correctly formatted filter configs",
    async () => {
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
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get correctly formatted all jobs filter configs",
    async () => {
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
    },
    REALLY_LONG_TIME,
  );
});
