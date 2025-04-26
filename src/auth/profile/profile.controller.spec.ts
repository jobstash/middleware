import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TestingModule, Test } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import { Auth0Module } from "src/auth0/auth0.module";
import envSchema from "src/env-schema";
import { ModelService } from "src/model/model.service";
import { AuthModule } from "../auth.module";
import { PrivyModule } from "../privy/privy.module";
import { GithubModule } from "../github/github.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { ThrottlerModule } from "@nestjs/throttler";
import { PaymentsModule } from "src/payments/payments.module";
import { ScorerModule } from "src/scorer/scorer.module";
import { RpcService } from "src/user/rpc.service";
import { UserService } from "src/user/user.service";
import { PermissionService } from "src/user/permission.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { MailService } from "src/mail/mail.service";
import { JobsService } from "src/jobs/jobs.service";
import { JwtService } from "@nestjs/jwt";
import {
  data,
  PaginatedData,
  SessionObject,
  UserOrg,
  UserProfile,
  UserRepo,
  UserVerifiedOrg,
} from "src/shared/interfaces";
import { ADMIN_SESSION_OBJECT, REALLY_LONG_TIME } from "src/shared/constants";
import { RepoListParams } from "./dto/repo-list.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";
import { TagsModule } from "src/tags/tags.module";
import { TagsService } from "src/tags/tags.service";
import { faker } from "@faker-js/faker";
import { createTestUser, resetTestDB } from "src/shared/helpers";
import { HttpModule, HttpService } from "@nestjs/axios";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as https from "https";
import { PrivyService } from "../privy/privy.service";
import { Integer } from "neo4j-driver";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { BullModule } from "@nestjs/bull";

describe("ProfileController", () => {
  let controller: ProfileController;
  let models: ModelService;
  let userService: UserService;
  let tagsService: TagsService;
  let httpService: HttpService;

  let USER_SESSION_OBJECT: SessionObject;
  const logger = new CustomLogger(`${ProfileController.name}TestSuite`);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        Auth0Module,
        forwardRef(() => AuthModule),
        forwardRef(() => ScorerModule),
        forwardRef(() => PrivyModule),
        forwardRef(() => GithubModule),
        TagsModule,
        ThrottlerModule.forRoot(),
        PaymentsModule,
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envSchema,
          validationOptions: {
            abortEarly: true,
          },
        }),
        BullModule.registerQueue({
          name: "mail",
          defaultJobOptions: {
            attempts: 5,
            backoff: {
              type: "exponential",
            },
            removeOnComplete: true,
            timeout: 60000,
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
            }) as NeogmaModuleOptions,
        }),
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
      controllers: [ProfileController],
      providers: [
        ProfileService,
        JwtService,
        ModelService,
        MailService,
        OrganizationsService,
        RpcService,
        JobsService,
        UserService,
        PermissionService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<ProfileController>(ProfileController);
    httpService = module.get<HttpService>(HttpService);
    userService = module.get<UserService>(UserService);
    tagsService = module.get<TagsService>(TagsService);

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
    "should get user profile",
    async () => {
      const result = await controller.getUserProfile(USER_SESSION_OBJECT);
      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(UserProfile),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get user repos",
    async () => {
      const params: RepoListParams = {
        page: 1,
        limit: 10,
      };
      const result = await controller.getUserRepos(USER_SESSION_OBJECT, params);
      expect(result).toEqual({
        page: 1,
        count: expect.any(Number),
        total: expect.any(Number),
        data: expect.any(Array<UserRepo>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get user organizations",
    async () => {
      const result = await controller.getUserOrgs(USER_SESSION_OBJECT);
      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<UserOrg>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get user verified organizations",
    async () => {
      const result = await controller.getUserVerifiedOrgs(USER_SESSION_OBJECT);
      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<UserVerifiedOrg>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get user showcases",
    async () => {
      const result = await controller.getUserShowCase(USER_SESSION_OBJECT);
      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<{ label: string; url: string }>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get user skills",
    async () => {
      const result = await controller.getUserSkills(USER_SESSION_OBJECT);
      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<{ label: string; url: string }>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's profile",
    async () => {
      const tags = await tagsService.getPopularTags(10);
      const showcase: UpdateUserShowCaseInput = {
        showcase: [
          {
            label: "CV",
            url: "https://urltothecv.com/cv.pdf",
          },
          {
            label: "Website",
            url: "https://mybeautifulwebsite.com",
          },
        ],
      };

      const skills: UpdateUserSkillsInput = {
        skills: tags.map(x => ({
          id: x.id,
          name: x.name,
          canTeach: faker.datatype.boolean({ probability: 0.75 }),
        })),
      };

      const op1 = await controller.setUserAvailability(
        USER_SESSION_OBJECT,
        true,
      );

      const op2 = await controller.setUserLocationInfo(USER_SESSION_OBJECT, {
        country: "Nigeria",
        city: "Lagos",
      });

      const op3 = await controller.updateUserShowCase(
        USER_SESSION_OBJECT,
        showcase,
      );

      const op4 = await controller.updateUserSkills(
        USER_SESSION_OBJECT,
        skills,
      );

      expect(op1).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      expect(op2).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      expect(op3).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      expect(op4).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const result = await controller.getUserProfile(USER_SESSION_OBJECT);
      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          ...data(result),
          wallet: USER_SESSION_OBJECT.address,
          location: {
            country: "Nigeria",
            city: "Lagos",
          },
          availableForWork: true,
        },
      });

      const result3 = await controller.getUserShowCase(USER_SESSION_OBJECT);
      expect(result3).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining(
          showcase.showcase.map(x => ({
            id: expect.any(String),
            label: x.label,
            url: x.url,
          })),
        ),
      });

      const result4 = await controller.getUserSkills(USER_SESSION_OBJECT);
      expect(result4).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining(skills.skills),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's repo contribution",
    async () => {
      const fetchParams = {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      };
      const repos = (await controller.getUserRepos(
        USER_SESSION_OBJECT,
        fetchParams,
      )) as PaginatedData<UserRepo>;

      const params: UpdateRepoContributionInput = {
        id: repos.data[0].id,
        contribution: "I contributed to this repo",
      };

      const result = await controller.updateRepoContribution(
        USER_SESSION_OBJECT,
        params,
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const check = await controller.getUserRepos(
        USER_SESSION_OBJECT,
        fetchParams,
      );

      expect(check).toEqual({
        page: 1,
        total: expect.any(Number),
        count: expect.any(Number),
        data: expect.arrayContaining([
          {
            ...repos.data[0],
            contribution: params.contribution,
          },
        ]),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's repo tags used",
    async () => {
      const tags = await tagsService.getPopularTags(2);
      const fetchParams = {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      };
      const repos = (await controller.getUserRepos(
        USER_SESSION_OBJECT,
        fetchParams,
      )) as PaginatedData<UserRepo>;

      const params: UpdateRepoTagsUsedInput = {
        id: repos.data[0].id,
        tagsUsed: tags.map(x => ({
          id: x.id,
          name: x.name,
          normalizedName: x.normalizedName,
          canTeach: faker.datatype.boolean({ probability: 0.75 }),
        })),
      };

      const result = await controller.updateRepoTagsUsed(
        USER_SESSION_OBJECT,
        params,
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const check = await controller.getUserRepos(
        USER_SESSION_OBJECT,
        fetchParams,
      );

      expect(check).toEqual({
        page: 1,
        total: expect.any(Number),
        count: expect.any(Number),
        data: expect.arrayContaining([
          {
            ...repos.data[0],
            tags: params.tagsUsed,
          },
        ]),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should review a user's org",
    async () => {
      const salary = {
        currency: "USD",
        offersTokenAllocation: false,
        salary: 123456,
      };
      const result1 = await controller.reviewOrgSalary(USER_SESSION_OBJECT, {
        ...salary,
        orgId: "345",
      });

      expect(result1).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const ratings = {
        benefits: 4.5,
        careerGrowth: 4.5,
        diversityInclusion: 4.5,
        management: 4.5,
        onboarding: 4.5,
        product: 4.5,
        compensation: 4.5,
        workLifeBalance: 4.5,
      };

      const result2 = await controller.rateOrg(USER_SESSION_OBJECT, {
        ...ratings,
        orgId: "345",
      });

      expect(result2).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const review = {
        title: "This is a test review",
        location: "REMOTE",
        timezone: "GMT+01",
        pros: "We have pizza",
        cons: "It's got pineapples",
      };

      const result3 = await controller.reviewOrg(USER_SESSION_OBJECT, {
        ...review,
        orgId: "345",
      });

      expect(result3).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const check = await controller.getUserOrgs(USER_SESSION_OBJECT);
      const org = data(check).find(x => x.org.orgId === "345");
      expect(check).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining([
          {
            ...org,
            compensation: salary,
            review: {
              id: expect.any(String),
              ...review,
            },
            rating: ratings,
          },
        ]),
      });
    },
    REALLY_LONG_TIME,
  );
});
