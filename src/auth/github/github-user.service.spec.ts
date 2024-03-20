import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import envSchema from "src/env-schema";
import { ModelModule } from "src/model/model.module";
import { UserModule } from "src/user/user.module";
import { ModelService } from "src/model/model.service";
import {
  EPHEMERAL_TEST_GITHUB_USER,
  EPHEMERAL_TEST_WALLET,
  NOT_SO_RANDOM_TEST_UUID,
  REALLY_LONG_TIME,
  TEST_GITHUB_USER,
} from "src/shared/constants";
import { UserFlowService } from "src/user/user-flow.service";
import { UserRoleService } from "src/user/user-role.service";
import { UserService } from "src/user/user.service";
import { AuthService } from "../auth.service";
import { GithubUserService } from "./github-user.service";
import { HttpModule, HttpService } from "@nestjs/axios";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { resetTestDB } from "src/shared/helpers";
import * as https from "https";
import { GithubInfo } from "./dto/github-info.input";
import { randomUUID } from "crypto";
import { GithubUserEntity } from "src/shared/entities";

describe("GithubUserService", () => {
  let models: ModelService;
  let githubUserService: GithubUserService;
  let userService: UserService;
  let httpService: HttpService;

  const logger = new CustomLogger(`${GithubUserService.name}TestSuite`);

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
        AuthService,
        JwtService,
        UserService,
        UserRoleService,
        UserFlowService,
        ModelService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    githubUserService = module.get<GithubUserService>(GithubUserService);
    userService = module.get<UserService>(UserService);
    httpService = module.get<HttpService>(HttpService);
  }, REALLY_LONG_TIME);

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.restoreAllMocks();
  }, REALLY_LONG_TIME);

  it("should be instantiated correctly", () => {
    expect(githubUserService).toBeDefined();
  });

  it(
    "should access models",
    async () => {
      expect(models.GithubUsers).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should create a github user node",
    async () => {
      const githubData = await githubUserService.findByLogin(TEST_GITHUB_USER);

      const dto = {
        ...githubData?.getProperties(),
        id: NOT_SO_RANDOM_TEST_UUID,
        login: "AndySmakov",
      };

      const createdNode = await githubUserService.create(dto);

      expect(createdNode.getProperties()).toEqual(dto);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find a github user node by its login",
    async () => {
      const githubData = await githubUserService.findByLogin(
        EPHEMERAL_TEST_GITHUB_USER,
      );
      expect(githubData).toBeDefined();
      expect(githubData).toEqual(expect.any(GithubUserEntity));
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find a github user node by its id",
    async () => {
      const githubData = await githubUserService.findById(
        NOT_SO_RANDOM_TEST_UUID,
      );
      expect(githubData).toBeDefined();
      expect(githubData).toEqual(expect.any(GithubUserEntity));
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find all github user nodes",
    async () => {
      const githubData = await githubUserService.findAll();
      expect(githubData).toStrictEqual(expect.any(Array<GithubUserEntity>));
      expect(
        githubData.find(x => x.getId() === NOT_SO_RANDOM_TEST_UUID),
      ).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a github user node",
    async () => {
      const githubData = await githubUserService.findByLogin(
        EPHEMERAL_TEST_GITHUB_USER,
      );
      const updatedGravatarId = randomUUID();

      const dto = {
        ...githubData?.getProperties(),
        gravatarId: updatedGravatarId,
      };

      const updatedNode = await githubUserService.update(
        NOT_SO_RANDOM_TEST_UUID,
        dto,
      );

      expect(updatedNode.getProperties()).toEqual(dto);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should delete a github user node",
    async () => {
      await githubUserService.delete(NOT_SO_RANDOM_TEST_UUID);

      const githubData = await githubUserService.findByLogin(
        EPHEMERAL_TEST_GITHUB_USER,
      );

      expect(githubData).toBeUndefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should upsert a github user node",
    async () => {
      const githubData = await githubUserService.findByLogin(TEST_GITHUB_USER);
      const updatedGravatarId = randomUUID();

      const dto = {
        ...githubData?.getProperties(),
        id: NOT_SO_RANDOM_TEST_UUID.replace("e", "p"),
        login: EPHEMERAL_TEST_GITHUB_USER + "2",
        gravatarId: updatedGravatarId,
      };

      const updatedNode = await githubUserService.upsert(dto);

      expect(updatedNode.getProperties()).toEqual(dto);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should add github info to a user's profile",
    async () => {
      const githubData = await githubUserService.findByLogin(TEST_GITHUB_USER);
      const args: GithubInfo = {
        wallet: EPHEMERAL_TEST_WALLET,
        githubId: NOT_SO_RANDOM_TEST_UUID,
        githubLogin: EPHEMERAL_TEST_GITHUB_USER,
        githubNodeId: githubData?.getNodeId(),
        githubAccessToken: githubData?.getAccessToken(),
        githubAvatarUrl: githubData?.getAvatarUrl(),
        githubRefreshToken: githubData?.getRefreshToken(),
        githubGravatarId: githubData?.getGravatarId(),
      };
      const user = await userService.createSIWEUser(EPHEMERAL_TEST_WALLET);
      expect(user).toBeDefined();

      const github = await githubUserService.addGithubInfoToUser(args);
      expect(github).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          available: expect.any(Boolean),
          id: expect.any(String),
          wallet: EPHEMERAL_TEST_WALLET,
        },
      });

      const verifyAction = await githubUserService.githubUserHasUser(
        NOT_SO_RANDOM_TEST_UUID,
      );

      expect(verifyAction).toBe(true);
    },
    REALLY_LONG_TIME,
  );
});
