import { Test, TestingModule } from "@nestjs/testing";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobListParams } from "./dto/job-list.input";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import {
  AllJobsFilterConfigs,
  JobFilterConfigs,
  JobListResult,
  AllJobsListResult,
  ProjectWithRelations,
  data,
  DateRange,
} from "src/shared/types";
import { Integer } from "neo4j-driver";
import {
  hasDuplicates,
  normalizeString,
  notStringOrNull,
  printDuplicateItems,
  publicationDateRangeGenerator,
  resetTestDB,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { ModelModule } from "src/model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import { AuthService } from "src/auth/auth.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { forwardRef } from "@nestjs/common";
import { TagsService } from "src/tags/tags.service";
import { EMPTY_SESSION_OBJECT, REALLY_LONG_TIME } from "src/shared/constants";
import { HttpModule, HttpService } from "@nestjs/axios";
import * as https from "https";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ScorerService } from "src/scorer/scorer.service";
import { AuthModule } from "src/auth/auth.module";
import { PrivyModule } from "src/auth/privy/privy.module";
import { ProfileModule } from "src/auth/profile/profile.module";
import { RpcService } from "src/user/rpc.service";
import { PaymentsModule } from "src/payments/payments.module";
import { UserModule } from "src/user/user.module";
import { faker } from "@faker-js/faker";
import { sampleSize } from "lodash";
import { CustomLogger } from "src/shared/utils/custom-logger";

describe("JobsController", () => {
  let controller: JobsController;
  let models: ModelService;
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
      x => x.name,
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
        forwardRef(() => AuthModule),
        forwardRef(() => ProfileModule),
        forwardRef(() => PrivyModule),
        forwardRef(() => PaymentsModule),
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
              retryDelay: 5000,
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
        OrganizationsService,
        ScorerService,
        RpcService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<JobsController>(JobsController);
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

  // it(
  //   "should change a job's classification",
  //   async () => {
  //     const params: JobListParams = {
  //       ...new JobListParams(),
  //       page: 1,
  //       limit: 5,
  //     };

  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const newClassification = "OPERATIONS";

  //     const job = (
  //       await controller.getJobsListWithSearch(
  //         req as Request,
  //         res as Response,
  //         params,
  //         undefined,
  //       )
  //     ).data.find(job => job.classification !== newClassification);

  //     const result = await controller.changeClassification(
  //       req as Request,
  //       res as Response,
  //       { classification: newClassification, shortUUIDs: [job.shortUUID] },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //     });

  //     const details = await controller.getJobDetailsByUuid(
  //       job.shortUUID,
  //       req as Request,
  //       res as Response,
  //       undefined,
  //     );

  //     expect(details.classification).toBe(newClassification);
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should make a job featured",
  //   async () => {
  //     const params: JobListParams = {
  //       ...new JobListParams(),
  //       page: 10,
  //       limit: 5,
  //     };

  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const startDate = subWeeks(new Date(), 1);
  //     const endDate = addWeeks(startDate, 10);

  //     const job = (
  //       await controller.getJobsListWithSearch(
  //         req as Request,
  //         res as Response,
  //         params,
  //         undefined,
  //       )
  //     ).data.find(job => !job.featured);

  //     const result = await controller.makeFeatured(
  //       req as Request,
  //       res as Response,
  //       {
  //         shortUUID: job.shortUUID,
  //         startDate: startDate.toISOString(),
  //         endDate: endDate.toISOString(),
  //       },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //     });

  //     const details = await controller.getJobDetailsByUuid(
  //       job.shortUUID,
  //       req as Request,
  //       res as Response,
  //       undefined,
  //     );

  //     expect(details.featured).toBe(true);
  //     expect(details.featureStartDate).toBe(startDate.getTime());
  //     expect(details.featureEndDate).toBe(endDate.getTime());
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should edit a job's tags",
  //   async () => {
  //     const params: JobListParams = {
  //       ...new JobListParams(),
  //       page: 1,
  //       limit: 1,
  //     };

  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const newTags = ["TypeScript"];

  //     const job = (
  //       await controller.getJobsListWithSearch(
  //         req as Request,
  //         res as Response,
  //         params,
  //         undefined,
  //       )
  //     ).data[0];

  //     const result = await controller.editTags(
  //       req as Request,
  //       res as Response,
  //       {
  //         shortUUID: job.shortUUID,
  //         tags: newTags,
  //       },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //     });

  //     const details = await controller.getJobDetailsByUuid(
  //       job.shortUUID,
  //       req as Request,
  //       res as Response,
  //       undefined,
  //     );

  //     expect(details.tags.map(x => x.name)).toStrictEqual(
  //       expect.arrayContaining(newTags),
  //     );
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should update a job's metadata",
  //   async () => {
  //     const params: JobListParams = {
  //       ...new JobListParams(),
  //       page: 1,
  //       limit: 1,
  //     };

  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const commitment = "INTERNSHIP";
  //     const classification = "OPERATIONS";
  //     const locationType = "REMOTE";
  //     const newTags = ["TypeScript"].map(x => ({
  //       id: randomUUID(),
  //       name: x,
  //       normalizedName: x,
  //     }));

  //     const {
  //       shortUUID,
  //       benefits,
  //       culture,
  //       description,
  //       location,
  //       maximumSalary,
  //       minimumSalary,
  //       offersTokenAllocation,
  //       paysInCrypto,
  //       requirements,
  //       responsibilities,
  //       salary,
  //       salaryCurrency,
  //       seniority,
  //       summary,
  //       title,
  //       url,
  //     } = (
  //       await controller.getJobsListWithSearch(
  //         req as Request,
  //         res as Response,
  //         params,
  //         undefined,
  //       )
  //     ).data[0];

  //     const result = await controller.updateJobMetadata(
  //       req as Request,
  //       res as Response,
  //       shortUUID,
  //       {
  //         isBlocked: false,
  //         isOnline: true,
  //         project: undefined,
  //         commitment,
  //         classification,
  //         locationType,
  //         benefits,
  //         culture,
  //         description,
  //         location,
  //         maximumSalary,
  //         minimumSalary,
  //         offersTokenAllocation,
  //         paysInCrypto,
  //         requirements,
  //         responsibilities,
  //         salary,
  //         salaryCurrency,
  //         seniority,
  //         summary,
  //         title,
  //         url,
  //         tags: newTags,
  //       },
  //     );

  //     expect(result).toStrictEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //       data: expect.any(JobDetailsResult),
  //     });

  //     const details = await controller.getJobDetailsByUuid(
  //       shortUUID,
  //       req as Request,
  //       res as Response,
  //       undefined,
  //     );

  //     expect(details.tags.map(x => x.name)).toStrictEqual(
  //       expect.arrayContaining(newTags.map(x => x.name)),
  //     );
  //     expect(details.commitment).toEqual(commitment);
  //     expect(details.classification).toEqual(classification);
  //     expect(details.locationType).toEqual(locationType);
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should block a job",
  //   async () => {
  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: _ => {
  //         return {} as Response;
  //       },
  //     };

  //     const result = await controller.blockJobs(
  //       req as Request,
  //       res as Response,
  //       { shortUUIDs: [NOT_SO_RANDOM_TEST_SHORT_UUID] },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //     });

  //     const details = await controller.getJobDetailsByUuid(
  //       NOT_SO_RANDOM_TEST_SHORT_UUID,
  //       req as Request,
  //       res as Response,
  //       undefined,
  //     );

  //     expect(details).toBeUndefined();
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should unblock a job",
  //   async () => {
  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const result = await controller.unblockJobs(
  //       req as Request,
  //       res as Response,
  //       { shortUUIDs: [NOT_SO_RANDOM_TEST_SHORT_UUID] },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //     });

  //     const details = await controller.getJobDetailsByUuid(
  //       NOT_SO_RANDOM_TEST_SHORT_UUID,
  //       req as Request,
  //       res as Response,
  //       undefined,
  //     );

  //     expect(details).toStrictEqual(expect.any(JobDetailsResult));
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should create a job folder for a user",
  //   async () => {
  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const result = await controller.createUserJobFolder(
  //       req as Request,
  //       res as Response,
  //       {
  //         name: "Demo Folder",
  //         isPublic: true,
  //         jobs: [],
  //       },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //       data: expect.any(JobpostFolder),
  //     });

  //     const details = await controller.getUserJobFolderById(
  //       req as Request,
  //       res as Response,
  //       data(result).id,
  //     );

  //     expect(details).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //       data: expect.any(JobpostFolder),
  //     });

  //     jobFolderId = data(result).id;
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should update a job folder",
  //   async () => {
  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const result = await controller.updateUserJobFolder(
  //       req as Request,
  //       res as Response,
  //       jobFolderId,
  //       {
  //         name: "Demo Folder",
  //         isPublic: true,
  //         jobs: [NOT_SO_RANDOM_TEST_SHORT_UUID],
  //       },
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //       data: expect.any(JobpostFolder),
  //     });
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should get a users job folders",
  //   async () => {
  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const result = await controller.getUserJobFolders(
  //       req as Request,
  //       res as Response,
  //     );

  //     expect(result).toStrictEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //       data: expect.any(Array<JobpostFolder>),
  //     });
  //   },
  //   REALLY_LONG_TIME,
  // );

  // it(
  //   "should delete a job folder",
  //   async () => {
  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       status: code => {
  //         return this;
  //       },
  //     };

  //     const result = await controller.deleteUserJobFolder(
  //       req as Request,
  //       res as Response,
  //       jobFolderId,
  //     );

  //     expect(result).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //     });

  //     const details = await controller.getUserJobFolderById(
  //       req as Request,
  //       res as Response,
  //       jobFolderId,
  //     );

  //     expect(data(details)).toBeUndefined();
  //   },
  //   REALLY_LONG_TIME,
  // );

  it(
    "should get jobs list with no jobpost and array property duplication",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
      };

      const result = await controller.getJobsListWithSearch(
        EMPTY_SESSION_OBJECT,
        params,
        undefined,
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
    "should get correctly formatted filter configs",
    async () => {
      const configs = await controller.getFilterConfigs(undefined);

      expect(configs).toBeDefined();

      const validationResult =
        JobFilterConfigs.JobFilterConfigsType.decode(configs);
      if (isRight(validationResult)) {
        const validatedResult = validationResult.right;
        expect(validatedResult).toEqual(configs);
        const investors = configs.investors.options.map(x => x.value);
        const tags = configs.tags.options.map(x => x.value);
        printDuplicateItems(
          new Set(investors),
          investors,
          "Investor with name",
        );
        printDuplicateItems(new Set(tags), tags, "Tag with name");
      } else {
        report(validationResult).forEach(x => {
          throw new Error(x);
        });
      }
    },
    REALLY_LONG_TIME,
  );

  it(
    "should respond with the correct results for job based filters",
    async () => {
      faker.seed(1111);
      const configs = await controller.getFilterConfigs(undefined);
      const minSalary = faker.number.int({ min: 100000, max: 200000 });
      const maxSalary = minSalary * 2;
      const query = faker.person.jobTitle();
      const tags = sampleSize(
        configs.tags.options.map(x => x.value),
        2,
      );
      const seniorityFilterList = sampleSize(
        configs.seniority.options.map(x => x.value),
        2,
      );
      const locationFilterList = sampleSize(
        configs.locations.options.map(x => x.value),
        2,
      );
      const classificationFilterList = sampleSize(
        configs.classifications.options.map(x => x.value),
        2,
      );
      const commitmentFilterList = sampleSize(
        configs.commitments.options.map(x => x.value),
        2,
      );
      const dateRange: DateRange = "this-month";
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 20,
        minSalaryRange: minSalary,
        maxSalaryRange: maxSalary,
        publicationDate: dateRange,
        seniority: seniorityFilterList as string[],
        locations: locationFilterList as string[],
        classifications: classificationFilterList as string[],
        commitments: commitmentFilterList as string[],
        tags: tags as string[],
        query,
      };

      const matchesFilters = (jobListResult: JobListResult): boolean => {
        const {
          salary,
          tags: jobTags,
          seniority,
          locationType,
          timestamp,
          title,
          classification,
          commitment,
        } = jobListResult;
        const { projects, name: orgName } = jobListResult.organization;
        const { startDate, endDate } = publicationDateRangeGenerator(dateRange);
        const matchesQuery =
          orgName.match(query) ||
          title.match(query) ||
          jobTags.filter(tag => tag.name.match(query)).length > 0 ||
          projects.filter(project => project.name.match(query)).length > 0;
        return (
          minSalary <= salary &&
          salary <= maxSalary &&
          jobTags.filter(tag => tags.includes(normalizeString(tag.name)))
            .length > 0 &&
          (!startDate || timestamp >= startDate) &&
          (!endDate || timestamp < endDate) &&
          (!query || matchesQuery) &&
          (!locationFilterList ||
            locationFilterList.includes(normalizeString(locationType))) &&
          (!classificationFilterList ||
            classificationFilterList.includes(
              normalizeString(classification),
            )) &&
          (!commitmentFilterList ||
            commitmentFilterList.includes(normalizeString(commitment))) &&
          (!seniorityFilterList ||
            seniorityFilterList.includes(normalizeString(seniority)))
        );
      };

      const result = await controller.getJobsListWithSearch(
        EMPTY_SESSION_OBJECT,
        params,
        undefined,
      );
      const results = result.data;
      expect(results.every(x => matchesFilters(x) === true)).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should respond with the correct results for organization based filters",
    async () => {
      faker.seed(1111);
      const configs = await controller.getFilterConfigs(undefined);
      const minHeadCount = faker.number.int({
        min: configs.headcountEstimate.value.lowest.value,
        max: configs.headcountEstimate.value.highest.value,
      });
      const maxHeadCount = minHeadCount * 2;
      const organizationFilterList = sampleSize(
        configs.organizations.options.map(x => x.value),
        2,
      );
      const investorFilterList = sampleSize(
        configs.investors.options.map(x => x.value),
        2,
      );
      const fundingRoundFilterList = sampleSize(
        configs.fundingRounds.options.map(x => x.value),
        2,
      );
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 20,
        minHeadCount: minHeadCount,
        maxHeadCount: maxHeadCount,
        organizations: organizationFilterList as string[],
        investors: investorFilterList as string[],
        fundingRounds: fundingRoundFilterList as string[],
      };

      const matchesFilters = (jobListResult: JobListResult): boolean => {
        const {
          investors,
          fundingRounds,
          name: orgName,
          headcountEstimate,
        } = jobListResult.organization;
        return (
          minHeadCount <= headcountEstimate &&
          headcountEstimate <= maxHeadCount &&
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
          (!organizationFilterList ||
            organizationFilterList.includes(normalizeString(orgName)))
        );
      };

      const result = await controller.getJobsListWithSearch(
        EMPTY_SESSION_OBJECT,
        params,
        undefined,
      );
      const results = result.data;
      expect(results.every(x => matchesFilters(x) === true)).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should respond with the correct results for project based filters",
    async () => {
      const token = false;
      const mainNet = true;
      const minTvl = 1000;
      const maxTvl = 1000000;
      const minMonthlyVolume = 1000;
      const maxMonthlyVolume = 1000000;
      const minMonthlyFees = 1000;
      const maxMonthlyFees = 1000000;
      const minMonthlyRevenue = 1000;
      const maxMonthlyRevenue = 1000000;
      const auditFilter = false;
      const chainFilterList = ["Ethereum", "Avalanche"];
      const projectFilterList = ["AAVE", "Base"];
      const hackFilter = true;

      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 20,
        token,
        mainNet,
        minTvl,
        maxTvl,
        minMonthlyVolume,
        maxMonthlyVolume,
        minMonthlyFees,
        maxMonthlyFees,
        minMonthlyRevenue,
        maxMonthlyRevenue,
        audits: auditFilter,
        hacks: hackFilter,
        chains: chainFilterList,
      };

      const matchesFilters = (jobListResult: JobListResult): boolean => {
        const { projects } = jobListResult.organization;
        return (
          (token === null ||
            projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
              .length > 0) &&
          (mainNet === null || projects.filter(x => x.isMainnet).length > 0) &&
          (!projectFilterList ||
            projects.filter(x =>
              projectFilterList.includes(normalizeString(x.name)),
            ).length > 0) &&
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
                x.chains.filter(y =>
                  chainFilterList.includes(normalizeString(y.name)),
                ).length > 0,
            ).length > 0)
        );
      };

      const result = await controller.getJobsListWithSearch(
        EMPTY_SESSION_OBJECT,
        params,
        undefined,
      );
      const results = result.data;
      expect(results.every(x => matchesFilters(x) === true)).toBe(true);
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

      const job = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data[0];

      const details = await controller.getJobDetailsByUuid(
        job.shortUUID,
        EMPTY_SESSION_OBJECT,
        undefined,
      );

      expect(jlrHasArrayPropsDuplication(details)).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get featured jobs",
    async () => {
      const result = await controller.getFeaturedJobsList(undefined);
      const uuids = data(result).map(job => job.shortUUID);
      const setOfUuids = new Set([...uuids]);

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<JobListResult>),
      });

      printDuplicateItems(setOfUuids, uuids, "Featured Job with UUID");

      expect(uuids.length).toBe(setOfUuids.size);

      expect(
        data(result).every(x => jlrHasArrayPropsDuplication(x) === false),
      ).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get jobs for an org with no array property duplication",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 1,
      };

      const job = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data[0];

      const details = await controller.getOrgJobsList(
        job.organization.orgId,
        undefined,
      );

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

  // it(
  //   "should get a users bookmarked jobs",
  //   async () => {
  //     const params: JobListParams = {
  //       ...new JobListParams(),
  //       page: 1,
  //       limit: 1,
  //     };

  //     const req: Partial<Request> = {};
  //     const res: Partial<Response> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //   status: code => {
  //     return this;
  //   },
  // };

  //     jest.spyOn(authService, "getSession").mockImplementation(async () => ({
  //       address: EPHEMERAL_TEST_WALLET,
  //       destroy: async (): Promise<void> => {
  //         logger.log("session destroyed");
  //       },
  //       save: async (): Promise<void> => {
  //         logger.log("session saved");
  //       },
  //     }));

  //     const job = (
  //       await controller.getJobsListWithSearch(
  //         req as Request,
  //         res as Response,
  //         params,
  //       )
  //     ).data[0];

  //     const jobs = await controller.getOrgJobsList(job.organization.orgId);

  //     for (const job of jobs) {
  //       const result = await profileController.logBookmarkInteraction(
  //         req as Request,
  //         res as Response,
  //         job.shortUUID,
  //       );

  //       expect(result).toEqual({
  //         success: true,
  //         message: expect.stringMatching("success"),
  //       });
  //     }

  //     const bookmarked = await controller.getUserBookmarkedJobs(
  //       req as Request,
  //       res as Response,
  //     );

  //     expect(bookmarked).toEqual({
  //       success: true,
  //       message: expect.stringMatching("success"),
  //       data: expect.any(Array<JobListResult>),
  //     });

  //     console.log(JSON.stringify(data(bookmarked).map(job => job.shortUUID)));

  //     expect(data(bookmarked).map(job => job.shortUUID)).toEqual(
  //       expect.arrayContaining(jobs.map(job => job.shortUUID)),
  //     );
  //   },
  //   REALLY_LONG_TIME,
  // );

  it(
    "should respond with the correct page ",
    async () => {
      const page = 1;
      const params: JobListParams = {
        ...new JobListParams(),
        page: page,
        limit: 1,
      };

      const result = await controller.getJobsListWithSearch(
        EMPTY_SESSION_OBJECT,
        params,
        undefined,
      );

      expect(result.page).toEqual(page);
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
