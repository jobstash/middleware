import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import envSchema from "src/env-schema";
import { ModelModule } from "src/model/model.module";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "./profile.service";
import { ModelService } from "src/model/model.service";
import {
  PaginatedData,
  UserOrg,
  UserProfile,
  UserRepo,
  UserShowCase,
  UserSkill,
  data,
} from "src/shared/interfaces";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { HttpModule, HttpService } from "@nestjs/axios";
import { AuthService } from "../auth.service";
import { UserService } from "src/user/user.service";
import { UserRoleService } from "src/user/user-role.service";
import { UserFlowService } from "src/user/user-flow.service";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import {
  DEV_TEST_WALLET,
  EPHEMERAL_TEST_WALLET,
  REALLY_LONG_TIME,
  TEST_EMAIL,
  TEST_GITHUB_USER,
} from "src/shared/constants";
import { TagsService } from "src/tags/tags.service";
import { Integer } from "neo4j-driver";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { resetTestDB } from "src/shared/helpers";
import * as https from "https";
import { GithubUserService } from "../github/github-user.service";
import { ScorerService } from "src/scorer/scorer.service";

describe("ProfileService", () => {
  let models: ModelService;
  let profileService: ProfileService;
  let githubUserService: GithubUserService;
  let userService: UserService;
  let tagsService: TagsService;
  let httpService: HttpService;

  const logger = new CustomLogger(`${ProfileService.name}TestSuite`);

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
      providers: [
        ProfileService,
        AuthService,
        JwtService,
        UserService,
        UserRoleService,
        UserFlowService,
        ModelService,
        GithubUserService,
        TagsService,
        ScorerService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    profileService = module.get<ProfileService>(ProfileService);
    githubUserService = module.get<GithubUserService>(GithubUserService);
    userService = module.get<UserService>(UserService);
    tagsService = module.get<TagsService>(TagsService);
    httpService = module.get<HttpService>(HttpService);
  }, REALLY_LONG_TIME);

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.restoreAllMocks();
  }, REALLY_LONG_TIME);

  it("should be instantiated correctly", () => {
    expect(profileService).toBeDefined();
  });

  it(
    "should access models",
    async () => {
      expect(models.Users).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's profile",
    async () => {
      const user = await userService.createSIWEUser(EPHEMERAL_TEST_WALLET);
      const github = await githubUserService.unsafe__linkGithubUser(
        EPHEMERAL_TEST_WALLET,
        TEST_GITHUB_USER,
      );
      await userService.addUserEmail(EPHEMERAL_TEST_WALLET, TEST_EMAIL);
      await userService.verifyUserEmail(TEST_EMAIL);

      expect(user).toBeDefined();
      expect(github).toBeDefined();
      expect(github.login).toBe(TEST_GITHUB_USER);

      await userService.setWalletFlow({
        flow: CheckWalletFlows.ONBOARD_REPO,
        wallet: EPHEMERAL_TEST_WALLET,
      });

      await userService.setWalletRole({
        role: CheckWalletRoles.DEV,
        wallet: EPHEMERAL_TEST_WALLET,
      });

      const profileData = {
        availableForWork: true,
        contact: {
          preferred: "Email",
          value: "test@jobstash.xyz",
        },
        location: {
          country: "Memory",
          city: "Heap",
        },
      };

      const newProfile = await profileService.updateDevUserProfile(
        EPHEMERAL_TEST_WALLET,
        profileData,
      );

      expect(newProfile).toBeDefined();
      expect(newProfile).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          avatar: expect.any(String),
          username: TEST_GITHUB_USER,
          email: TEST_EMAIL,
          wallet: EPHEMERAL_TEST_WALLET,
          ...profileData,
        },
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's showcases",
    async () => {
      const showcase = [
        {
          label: "CV",
          url: "https://urltothecv.com/cv.pdf",
        },
        {
          label: "Website",
          url: "https://mybeautifulwebsite.com",
        },
      ];

      const response = await profileService.updateUserShowCase(
        EPHEMERAL_TEST_WALLET,
        {
          showcase,
        },
      );

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const showcases = await profileService.getUserShowCase(
        EPHEMERAL_TEST_WALLET,
      );

      expect(showcases).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining(
          showcase.map(x => ({ id: expect.any(String), ...x })),
        ),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's skills",
    async () => {
      const skills = (await tagsService.getAllUnblockedTags())
        .slice(undefined, 5)
        .map(x => ({ ...x, canTeach: false }));

      const response = await profileService.updateUserSkills(
        EPHEMERAL_TEST_WALLET,
        {
          skills,
        },
      );

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const userSkills = await profileService.getUserSkills(
        EPHEMERAL_TEST_WALLET,
      );

      expect(userSkills).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining<UserSkill>(
          skills.map(x => ({
            id: expect.any(String),
            ...x,
            normalizedName: undefined,
          })),
        ),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should review a user's org salary",
    async () => {
      const reviewData = {
        currency: "USD",
        offersTokenAllocation: false,
        salary: 123456,
      };
      const response = await profileService.reviewOrgSalary(
        EPHEMERAL_TEST_WALLET,
        { ...reviewData, orgId: "345" },
      );

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const org345 = data(
        await profileService.getUserOrgs(EPHEMERAL_TEST_WALLET),
      )?.find(x => x.org.orgId === "345");

      expect(org345).toEqual({
        ...org345,
        compensation: {
          ...reviewData,
        },
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should rate a user's org",
    async () => {
      const reviewData = {
        onboarding: 1,
        careerGrowth: 1,
        benefits: 1,
        workLifeBalance: 1,
        diversityInclusion: 1,
        management: 1,
        product: 1,
        compensation: 1,
      };
      const response = await profileService.rateOrg(EPHEMERAL_TEST_WALLET, {
        ...reviewData,
        orgId: "345",
      });

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const org345 = data(
        await profileService.getUserOrgs(EPHEMERAL_TEST_WALLET),
      )?.find(x => x.org.orgId === "345");

      expect(org345).toEqual({
        ...org345,
        rating: {
          ...reviewData,
        },
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should review a user's org",
    async () => {
      const reviewData = {
        title: "This is a test review",
        location: "REMOTE",
        timezone: "GMT+01",
        pros: "We have pizza",
        cons: "It's got pineapples",
      };
      const response = await profileService.reviewOrg(EPHEMERAL_TEST_WALLET, {
        ...reviewData,
        orgId: "345",
      });

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const org345 = data(
        await profileService.getUserOrgs(EPHEMERAL_TEST_WALLET),
      )?.find(x => x.org.orgId === "345");

      expect(org345).toEqual({
        ...org345,
        review: {
          id: expect.any(String),
          ...reviewData,
        },
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's repo contribution",
    async () => {
      const repo = (await profileService.getUserRepos(EPHEMERAL_TEST_WALLET, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as PaginatedData<UserRepo>;

      const contributionData = {
        id: repo?.data[0]?.id,
        contribution: "I designed the pizza maker",
      };

      const response = await profileService.updateRepoContribution(
        EPHEMERAL_TEST_WALLET,
        contributionData,
      );

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const updatedRepo = (
        (await profileService.getUserRepos(EPHEMERAL_TEST_WALLET, {
          limit: Integer.MAX_SAFE_VALUE.toNumber(),
          page: 1,
        })) as PaginatedData<UserRepo>
      )?.data?.find(x => x.id === contributionData.id);

      expect(updatedRepo.contribution.summary).toBe(
        contributionData.contribution,
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a user's repo tags used",
    async () => {
      const repo = (await profileService.getUserRepos(EPHEMERAL_TEST_WALLET, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as PaginatedData<UserRepo>;

      const skills = (await tagsService.getAllUnblockedTags())
        .slice(undefined, 5)
        .map(x => ({ ...x, canTeach: false }));

      const contributionData = {
        id: repo?.data[0]?.id,
        tagsUsed: skills,
      };

      const response = await profileService.updateRepoTagsUsed(
        EPHEMERAL_TEST_WALLET,
        contributionData,
      );

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const updatedRepo = (
        (await profileService.getUserRepos(EPHEMERAL_TEST_WALLET, {
          limit: Integer.MAX_SAFE_VALUE.toNumber(),
          page: 1,
        })) as PaginatedData<UserRepo>
      )?.data?.find(x => x.id === contributionData.id);

      expect(updatedRepo.tags).toEqual(expect.arrayContaining(skills));
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's profile",
    async () => {
      const profile = await profileService.getDevUserProfile(DEV_TEST_WALLET);
      expect(profile).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(UserProfile),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's repos",
    async () => {
      const repos = await profileService.getUserRepos(DEV_TEST_WALLET, {
        limit: 1,
        page: 1,
      });
      expect(repos).toEqual({
        count: expect.any(Number),
        total: expect.any(Number),
        page: expect.any(Number),
        data: expect.any(Array<UserRepo>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's orgs",
    async () => {
      const orgs = await profileService.getUserOrgs(DEV_TEST_WALLET);
      expect(orgs).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<UserOrg>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's showcases",
    async () => {
      const showcases = await profileService.getUserShowCase(DEV_TEST_WALLET);
      expect(showcases).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<UserShowCase>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's skills",
    async () => {
      const skills = await profileService.getUserShowCase(DEV_TEST_WALLET);
      expect(skills).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<UserSkill>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should delete a user's account",
    async () => {
      const user = await userService.createSIWEUser(EPHEMERAL_TEST_WALLET);

      expect(user).toBeDefined();

      const response = await profileService.deleteUserAccount(
        EPHEMERAL_TEST_WALLET,
      );

      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const profile = await profileService.getDevUserProfile(
        EPHEMERAL_TEST_WALLET,
      );

      const newProfileData = {
        availableForWork: false,
        contact: {
          preferred: null,
          value: null,
        },
        location: {
          country: null,
          city: null,
        },
      };

      expect(profile).not.toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          avatar: null,
          username: null,
          email: null,
          wallet: EPHEMERAL_TEST_WALLET,
          ...newProfileData,
        },
      });
    },
    REALLY_LONG_TIME,
  );
});
