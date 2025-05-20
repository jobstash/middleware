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
  JobDetailsResult,
  SessionObject,
  JobpostFolder,
} from "src/shared/types";
import { Integer } from "neo4j-driver";
import {
  createTestUser,
  hasDuplicates,
  slugify,
  notStringOrNull,
  publicationDateRangeGenerator,
  resetTestDB,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { ModelModule } from "src/model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import { ModelService } from "src/model/model.service";
import { AuthService } from "src/auth/auth.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { forwardRef, NotFoundException } from "@nestjs/common";
import { TagsService } from "src/tags/tags.service";
import {
  ADMIN_SESSION_OBJECT,
  EMPTY_SESSION_OBJECT,
  REALLY_LONG_TIME,
} from "src/shared/constants";
import { HttpModule, HttpService } from "@nestjs/axios";
import * as https from "https";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ScorerService } from "src/scorer/scorer.service";
import { AuthModule } from "src/auth/auth.module";
import { PrivyModule } from "src/auth/privy/privy.module";
import { ProfileModule } from "src/auth/profile/profile.module";
import { RpcService } from "src/user/rpc.service";
import { UserModule } from "src/user/user.module";
import { faker } from "@faker-js/faker";
import { sampleSize } from "lodash";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { addWeeks, subWeeks } from "date-fns";
import { randomUUID } from "crypto";
import { Auth0Module } from "src/auth0/auth0.module";
import { UserService } from "src/user/user.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { PrivyService } from "src/auth/privy/privy.service";
import { CacheModule } from "@nestjs/cache-manager";
import { ScheduleModule } from "@nestjs/schedule";

describe("JobsController", () => {
  let controller: JobsController;
  let models: ModelService;
  let httpService: HttpService;
  let jobsService: JobsService;
  let userService: UserService;
  let profileService: ProfileService;

  let USER_SESSION_OBJECT: SessionObject;
  let jobFolder: JobpostFolder;

  const logger = new CustomLogger(`${JobsController.name}TestSuite`);

  const projectHasArrayPropsDuplication = (
    project: Omit<ProjectWithRelations, "detectedJobsites" | "jobsites">,
    jobPostUUID: string,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      `Audit for Project ${project.id} for Jobpost ${jobPostUUID}`,
      a => a.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateHacks = hasDuplicates(
      project.hacks,
      `Hack for Project ${project.id} for Jobpost ${jobPostUUID}`,
      h => h.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateChains = hasDuplicates(
      project.chains,
      `Chain for Project ${project.id} for Jobpost ${jobPostUUID}`,
      c => c.id,
      a => JSON.stringify(a),
    );
    expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    return hasDuplicateAudits && hasDuplicateHacks && hasDuplicateChains;
  };

  const jlrHasArrayPropsDuplication = (
    jobListResult: JobListResult | JobDetailsResult,
  ): boolean => {
    const hasDuplicateProjects = hasDuplicates(
      jobListResult.organization.projects,
      `Org Projects for Jobpost ${jobListResult.shortUUID}`,
      p => p.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateTechs = hasDuplicates(
      jobListResult.tags,
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
      x => x.name,
      a => JSON.stringify(a),
    );
    const hasDuplicateInvestors = hasDuplicates(
      jobListResult.organization.investors,
      `Investor for Jobpost ${jobListResult.shortUUID}`,
      i => i.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateFundingRounds = hasDuplicates(
      jobListResult.organization.fundingRounds,
      `Org Funding Rounds for Jobpost ${jobListResult.shortUUID}`,
      x => x.id,
      a => JSON.stringify(a),
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
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
      x => x.normalizedName,
      a => JSON.stringify(a),
    );
    expect(hasDuplicateTechs).toBe(false);
    return hasDuplicateTechs;
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        Auth0Module,
        forwardRef(() => AuthModule),
        forwardRef(() => ProfileModule),
        forwardRef(() => PrivyModule),
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
            }) as NeogmaModuleOptions,
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
        ScheduleModule.forRoot(),
        CacheModule.register({ isGlobal: true }),
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
    jobsService = module.get<JobsService>(JobsService);
    userService = module.get<UserService>(UserService);
    httpService = module.get<HttpService>(HttpService);
    profileService = module.get<ProfileService>(ProfileService);

    const adminWallet = await createTestUser(
      module.get<PrivyService>(PrivyService),
      userService,
    );

    USER_SESSION_OBJECT = {
      ...ADMIN_SESSION_OBJECT,
      address: adminWallet,
    };
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
    "should change a job's classification",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 5,
      };

      const newClassification = "OPERATIONS";

      const job = (
        await controller.getJobsListWithSearch(
          ADMIN_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data.find(job => job.classification !== newClassification);

      const result = await controller.changeClassification(
        EMPTY_SESSION_OBJECT,
        {
          classification: newClassification,
          shortUUIDs: [job.shortUUID],
        },
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const details = await controller.getJobDetailsByUuid(
        job.shortUUID,
        EMPTY_SESSION_OBJECT,
        undefined,
      );

      expect(details.classification).toBe(newClassification);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should make a job featured",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 10,
        limit: 5,
      };

      const startDate = subWeeks(new Date(), 1);
      const endDate = addWeeks(startDate, 10);

      const job = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data.find(job => !job.featured);

      const result = await controller.featureJobpost(EMPTY_SESSION_OBJECT, {
        shortUUID: job.shortUUID,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const details = await controller.getJobDetailsByUuid(
        job.shortUUID,
        EMPTY_SESSION_OBJECT,
        undefined,
      );

      expect(details.featured).toBe(true);
      expect(details.featureStartDate).toBe(startDate.getTime());
      expect(details.featureEndDate).toBe(endDate.getTime());
    },
    REALLY_LONG_TIME,
  );

  it(
    "should edit a job's tags",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 1,
      };

      const newTags = ["Typescript"];

      const job = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data[0];

      const result = await controller.editTags(EMPTY_SESSION_OBJECT, {
        shortUUID: job.shortUUID,
        tags: newTags,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const details = await controller.getJobDetailsByUuid(
        job.shortUUID,
        EMPTY_SESSION_OBJECT,
        undefined,
      );

      expect(details.tags.map(x => x.normalizedName)).toEqual(
        newTags.map(slugify),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a job's metadata",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 1,
      };

      const commitment = "INTERNSHIP";
      const classification = "OPERATIONS";
      const locationType = "REMOTE";
      const newTags = ["Typescript"].map(x => ({
        id: randomUUID(),
        name: x,
        normalizedName: x,
      }));

      const {
        shortUUID,
        benefits,
        culture,
        description,
        location,
        maximumSalary,
        minimumSalary,
        offersTokenAllocation,
        paysInCrypto,
        requirements,
        responsibilities,
        salary,
        salaryCurrency,
        seniority,
        summary,
        title,
        url,
      } = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data[0];

      const result = await controller.updateJobMetadata(
        ADMIN_SESSION_OBJECT,
        shortUUID,
        {
          isBlocked: false,
          isOnline: true,
          project: undefined,
          commitment,
          classification,
          locationType,
          benefits,
          culture,
          description,
          location,
          maximumSalary,
          minimumSalary,
          offersTokenAllocation,
          paysInCrypto,
          requirements,
          responsibilities,
          salary,
          salaryCurrency,
          seniority,
          summary,
          title,
          protected: false,
          onboardIntoWeb3: true,
          url,
          tags: newTags,
        },
      );

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const details = await controller.getJobDetailsByUuid(
        shortUUID,
        EMPTY_SESSION_OBJECT,
        undefined,
      );

      expect(details.tags.map(x => x.normalizedName)).toStrictEqual(
        expect.arrayContaining(newTags.map(x => x.normalizedName)),
      );
      expect(details.commitment).toEqual(commitment);
      expect(details.classification).toEqual(classification);
      expect(details.locationType).toEqual(locationType);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should block a job",
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

      const result = await controller.blockJobs(EMPTY_SESSION_OBJECT, {
        shortUUIDs: [job.shortUUID],
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      expect(
        await jobsService.getJobDetailsByUuid(job.shortUUID, undefined),
      ).toBeUndefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should unblock a job",
    async () => {
      const jobs = await controller.getAllJobsWithSearch({
        query: null,
        category: null,
        organizations: null,
      });

      const blocked = jobs.data.filter(x => x.isBlocked);

      const job = blocked[0];

      const result = await controller.unblockJobs(EMPTY_SESSION_OBJECT, {
        shortUUIDs: [job.shortUUID],
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const details = await controller.getJobDetailsByUuid(
        job.shortUUID,
        EMPTY_SESSION_OBJECT,
        undefined,
      );

      expect(details).toStrictEqual(expect.any(JobDetailsResult));
    },
    REALLY_LONG_TIME,
  );

  it(
    "should create a job folder for a user",
    async () => {
      const randomName = faker.company.name();
      const result = await controller.createUserJobFolder(USER_SESSION_OBJECT, {
        name: `Jobs at ${randomName}`,
        isPublic: true,
        jobs: [],
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(JobpostFolder),
      });

      const details = await controller.getUserJobFolderBySlug(
        USER_SESSION_OBJECT,
        data(result).slug,
      );

      expect(details).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(JobpostFolder),
      });

      jobFolder = data(result);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a job folder",
    async () => {
      const randomName = faker.company.name();
      const result = await controller.updateUserJobFolder(
        USER_SESSION_OBJECT,
        jobFolder.id,
        {
          name: `Jobs at ${randomName}`,
          isPublic: false,
          jobs: [],
        },
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(JobpostFolder),
      });

      jobFolder = data(result);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a users job folders",
    async () => {
      const result = await controller.getUserJobFolders(USER_SESSION_OBJECT);

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<JobpostFolder>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should delete a job folder",
    async () => {
      const result = await controller.deleteUserJobFolder(
        USER_SESSION_OBJECT,
        jobFolder.id,
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      await expect(
        controller.getUserJobFolderBySlug(USER_SESSION_OBJECT, jobFolder.slug),
      ).rejects.toThrowError(NotFoundException);
    },
    REALLY_LONG_TIME,
  );

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

      expect(result).toEqual({
        page: 1,
        count: expect.any(Number),
        total: expect.any(Number),
        data: expect.any(Array<JobListResult>),
      });

      expect(
        hasDuplicates(
          result.data,
          "StructuredJobpost with UUID",
          x => x.shortUUID,
          x =>
            `${x.shortUUID} with title ${x.title} from ${x.organization.name} (${x.organization.orgId})`,
        ),
      ).toBe(false);

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
        const investors = configs.investors.options.map(x =>
          x.value.toString(),
        );
        const tags = configs.tags.options.map(x => x.value.toString());
        hasDuplicates(
          investors,
          "Investor with name",
          x => x,
          x => x,
        );
        hasDuplicates(
          tags,
          "Tag with name",
          x => x,
          x => x,
        );
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
          jobTags.filter(tag => tags.includes(slugify(tag.name))).length > 0 &&
          (!startDate || timestamp >= startDate) &&
          (!endDate || timestamp < endDate) &&
          (!query || matchesQuery) &&
          (!locationFilterList ||
            locationFilterList.includes(slugify(locationType))) &&
          (!classificationFilterList ||
            classificationFilterList.includes(slugify(classification))) &&
          (!commitmentFilterList ||
            commitmentFilterList.includes(slugify(commitment))) &&
          (!seniorityFilterList ||
            seniorityFilterList.includes(slugify(seniority)))
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
        investors: investorFilterList as string[],
        fundingRounds: fundingRoundFilterList as string[],
      };

      const matchesFilters = (jobListResult: JobListResult): boolean => {
        if (jobListResult.organization) {
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
                investorFilterList.includes(slugify(investor.name)),
              ).length > 0) &&
            (!fundingRoundFilterList ||
              fundingRounds.filter(fundingRound =>
                fundingRoundFilterList.includes(
                  slugify(fundingRound.roundName),
                ),
              ).length > 0) &&
            (!organizationFilterList ||
              organizationFilterList.includes(slugify(orgName)))
          );
        } else {
          return false;
        }
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
        if (jobListResult.organization) {
          const { projects } = jobListResult.organization;
          return (
            (token === null ||
              projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
                .length > 0) &&
            (!projectFilterList ||
              projects.filter(x => projectFilterList.includes(slugify(x.name)))
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
              projects.filter(
                x => (x?.monthlyRevenue ?? 0) >= minMonthlyRevenue,
              ).length > 0) &&
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
                    chainFilterList.includes(slugify(y.name)),
                  ).length > 0,
              ).length > 0)
          );
        } else {
          return false;
        }
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

      expect(res).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<JobListResult>),
      });

      expect(
        hasDuplicates(
          res.data,
          "StructuredJobpost with UUID",
          x => x.shortUUID,
          x =>
            `${x.shortUUID} with title ${x.title} from ${x.organization.name} (${x.organization.orgId})`,
        ),
      ).toBe(false);

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
      const result = await controller.getFeaturedJobsList(
        null,
        undefined,
        EMPTY_SESSION_OBJECT,
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<JobListResult>),
      });

      expect(
        hasDuplicates(
          data(result),
          "Featured job with shortUUID",
          x => x.shortUUID,
          x =>
            `${x.shortUUID} with title ${x.title} from ${x.organization.name} (${x.organization.orgId})`,
        ),
      ).toBe(false);

      expect(
        data(result).every(x => jlrHasArrayPropsDuplication(x) === false),
      ).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get jobs for an org with no array property duplication",
    async () => {
      const details = await controller.getOrgJobsList("105", undefined);

      expect(
        hasDuplicates(
          details,
          "StructuredJobpost with UUID",
          x => x.shortUUID,
          x =>
            `${x.shortUUID} with title ${x.title} from ${x.organization.name} (${x.organization.orgId})`,
        ),
      ).toBe(false);
      expect(
        (details ?? []).every(x => jlrHasArrayPropsDuplication(x) === false),
      ).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get jobsites with no url duplication",
    async () => {
      const jobsites = await models.Jobsites.getAllJobsitesData();
      expect(
        hasDuplicates(
          jobsites,
          "Jobsite with url",
          x => x.url,
          x =>
            `Jobsite with id ${x.id} of type ${x.type} and owner ${x.orgId ?? x.projectId}`,
        ),
      ).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a users bookmarked jobs",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 3,
      };

      const jobs = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data;

      for (const job of jobs) {
        const result = await profileService.logBookmarkInteraction(
          USER_SESSION_OBJECT.address,
          job.shortUUID,
        );

        expect(result).toEqual({
          success: true,
          message: expect.stringMatching("success"),
        });
      }

      const bookmarked = await controller.getUserBookmarkedJobs(
        undefined,
        USER_SESSION_OBJECT,
      );

      expect(bookmarked).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<JobListResult>),
      });

      expect(data(bookmarked).map(job => job.shortUUID)).toEqual(
        expect.arrayContaining(jobs.map(job => job.shortUUID)),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's applied jobs",
    async () => {
      const params: JobListParams = {
        ...new JobListParams(),
        page: 1,
        limit: 3,
      };

      const jobs = (
        await controller.getJobsListWithSearch(
          EMPTY_SESSION_OBJECT,
          params,
          undefined,
        )
      ).data;

      for (const job of jobs) {
        const result = await profileService.logApplyInteraction(
          USER_SESSION_OBJECT.address,
          job.shortUUID,
        );

        expect(result).toEqual({
          success: true,
          message: expect.stringMatching("success"),
        });
      }

      const applied = await controller.getUserAppliedJobs(
        undefined,
        USER_SESSION_OBJECT,
      );

      expect(applied).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<JobListResult>),
      });

      expect(data(applied).map(job => job.shortUUID)).toEqual(
        expect.arrayContaining(jobs.map(job => job.shortUUID)),
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
