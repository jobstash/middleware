import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { TestingModule, Test } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { AuthService } from "src/auth/auth.service";
import { GithubUserService } from "src/auth/github/github-user.service";
import { ProfileService } from "src/auth/profile/profile.service";
import envSchema from "src/env-schema";
import { ModelModule } from "src/model/model.module";
import { ModelService } from "src/model/model.service";
import {
  CheckWalletFlows,
  CheckWalletRoles,
  EPHEMERAL_TEST_WALLET,
  REALLY_LONG_TIME,
  TEST_EMAIL,
  TEST_GITHUB_USER,
} from "src/shared/constants";
import { UserFlowService } from "./user-flow.service";
import { UserRoleService } from "./user-role.service";
import { UserModule } from "./user.module";
import { HttpModule, HttpService } from "@nestjs/axios";
import * as https from "https";
import { resetTestDB } from "src/shared/helpers";
import { UserProfile, data } from "src/shared/interfaces";

describe("UserService", () => {
  let models: ModelService;
  let profileService: ProfileService;
  let githubUserService: GithubUserService;
  let userService: UserService;
  let httpService: HttpService;

  const logger = new CustomLogger(`${UserService.name}TestSuite`);

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
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    profileService = module.get<ProfileService>(ProfileService);
    githubUserService = module.get<GithubUserService>(GithubUserService);
    userService = module.get<UserService>(UserService);
    httpService = module.get<HttpService>(HttpService);
  }, REALLY_LONG_TIME);

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.resetAllMocks();
  }, REALLY_LONG_TIME);

  it(
    "should create a siwe user",
    async () => {
      const user = await userService.createSIWEUser(EPHEMERAL_TEST_WALLET);
      expect(user).toStrictEqual({
        wallet: EPHEMERAL_TEST_WALLET,
        available: expect.any(Boolean),
        id: expect.any(String),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should add a siwe user's email",
    async () => {
      const user = data(
        await userService.addUserEmail(EPHEMERAL_TEST_WALLET, TEST_EMAIL),
      );
      expect(user.getProperties()).toStrictEqual({
        wallet: EPHEMERAL_TEST_WALLET,
        available: expect.any(Boolean),
        id: expect.any(String),
      });

      const profile = data<UserProfile>(
        await profileService.getDevUserProfile(EPHEMERAL_TEST_WALLET),
      );

      expect(profile.email).toBe(null);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should verify a siwe user's email",
    async () => {
      const user = await userService.verifyUserEmail(TEST_EMAIL);

      expect(user.getProperties()).toStrictEqual({
        wallet: EPHEMERAL_TEST_WALLET,
        available: expect.any(Boolean),
        id: expect.any(String),
      });

      const profile = data<UserProfile>(
        await profileService.getDevUserProfile(EPHEMERAL_TEST_WALLET),
      );

      expect(profile.email).toBe(TEST_EMAIL);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's flow",
    async () => {
      const flow = await userService.getWalletFlow(EPHEMERAL_TEST_WALLET);
      expect(flow.getName()).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get a user's role",
    async () => {
      const role = await userService.getWalletRole(EPHEMERAL_TEST_WALLET);
      expect(role.getName()).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should set a user's flow",
    async () => {
      const response = await userService.setWalletFlow({
        wallet: EPHEMERAL_TEST_WALLET,
        flow: CheckWalletFlows.SIGNUP_COMPLETE,
      });
      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });
      const flow = await userService.getWalletFlow(EPHEMERAL_TEST_WALLET);
      expect(flow.getName()).toBe(CheckWalletFlows.SIGNUP_COMPLETE);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should set a user's role",
    async () => {
      const response = await userService.setWalletRole({
        wallet: EPHEMERAL_TEST_WALLET,
        role: CheckWalletRoles.DEV,
      });
      expect(response).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });
      const role = await userService.getWalletRole(EPHEMERAL_TEST_WALLET);
      expect(role.getName()).toBe(CheckWalletRoles.DEV);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find a user by their wallet",
    async () => {
      const user = await userService.findByWallet(EPHEMERAL_TEST_WALLET);
      expect(user).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find a user by it's associated github user node id",
    async () => {
      const github = await githubUserService.findByLogin(TEST_GITHUB_USER);
      const user = await userService.findByGithubNodeId(github?.getNodeId());
      expect(user?.getWallet()).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find all users",
    async () => {
      const users = await userService.findAll();

      expect(users).toStrictEqual(expect.any(Array<UserProfile>));
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find all org users awaiting approval",
    async () => {
      const users = await userService.getOrgsAwaitingApproval();

      expect(users).toStrictEqual(expect.any(Array<UserProfile>));
    },
    REALLY_LONG_TIME,
  );
});
