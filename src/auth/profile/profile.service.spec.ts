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
import { AuthService } from "../auth.service";
import { UserService } from "src/user/user.service";
import { UserRoleService } from "src/user/user-role.service";
import { UserFlowService } from "src/user/user-flow.service";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/enums";
import {
  DEV_TEST_WALLET,
  EPHEMERAL_TEST_WALLET,
  REALLY_LONG_TIME,
  TEST_EMAIL,
  TEST_GITHUB_USER,
} from "src/shared/constants";
import { TagsService } from "src/tags/tags.service";
import { Integer } from "neo4j-driver";

describe("ProfileService", () => {
  let models: ModelService;
  let profileService: ProfileService;
  let userService: UserService;
  let tagsService: TagsService;
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
      ],
      providers: [
        ProfileService,
        AuthService,
        JwtService,
        UserService,
        UserRoleService,
        UserFlowService,
        ModelService,
        TagsService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    profileService = module.get<ProfileService>(ProfileService);
    userService = module.get<UserService>(UserService);
    tagsService = module.get<TagsService>(TagsService);
  }, REALLY_LONG_TIME);

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("should be instantiated correctly", () => {
    expect(profileService).toBeDefined();
  });

  it(
    "should be able to access models",
    async () => {
      expect(models.UserProfiles).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a users profile",
    async () => {
      const user = await userService.createSIWEUser(EPHEMERAL_TEST_WALLET);
      const github = await userService.addGithubUser(
        EPHEMERAL_TEST_WALLET,
        TEST_GITHUB_USER,
      );
      await userService.addUserEmail(EPHEMERAL_TEST_WALLET, TEST_EMAIL);
      await userService.verifyUserEmail(TEST_EMAIL);

      expect(user).toBeDefined();
      expect(github).toBeDefined();
      expect(github.login).toBe(TEST_GITHUB_USER);

      await userService.setFlowState({
        flow: CheckWalletFlows.ONBOARD_REPO,
        wallet: EPHEMERAL_TEST_WALLET,
      });

      await userService.setRoleState({
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

      const newProfile = await profileService.updateUserProfile(
        EPHEMERAL_TEST_WALLET,
        profileData,
      );

      expect(newProfile).toBeDefined();
      expect(newProfile).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          avatar: null,
          username: null,
          email: TEST_EMAIL,
          ...profileData,
        },
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a users showcases",
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
    "should update a users skills",
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
    "should review a users org salary",
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
    "should rate a users org",
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
    "should review a users org",
    async () => {
      const reviewData = {
        title: "This is a test review",
        location: "REMOTE",
        timezone: "GMT+01",
        pros: "We have pizza",
        cons: "It's got pineapples",
        workingHours: {
          start: "1",
          end: "2",
        },
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
          ...reviewData,
        },
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a users repo contribution",
    async () => {
      const repo = (await profileService.getUserRepos(EPHEMERAL_TEST_WALLET, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as PaginatedData<UserRepo>;

      // console.log(JSON.stringify(repo));

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
      )?.data.find(x => x.id === contributionData.id);

      expect(updatedRepo.contribution).toBe(contributionData.contribution);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a users repo tags used",
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
      )?.data.find(x => x.id === contributionData.id);

      expect(updatedRepo.tags).toEqual(expect.arrayContaining(skills));
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a users profile",
    async () => {
      const profile = await profileService.getUserProfile(DEV_TEST_WALLET);
      expect(profile).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(UserProfile),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a users repos",
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
    "should get a users orgs",
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
    "should get a users showcases",
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
    "should get a users skills",
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
    "should delete a users account",
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

      const profile = await profileService.getUserProfile(
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

      expect(profile).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          avatar: null,
          username: null,
          email: null,
          ...newProfileData,
        },
      });
    },
    REALLY_LONG_TIME,
  );
});
