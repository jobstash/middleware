import { HttpModule, HttpService } from "@nestjs/axios";
import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TestingModule, Test } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import envSchema from "src/env-schema";
import { ModelModule } from "src/model/model.module";
import { ModelService } from "src/model/model.service";
import { EPHEMERAL_TEST_WALLET, REALLY_LONG_TIME } from "src/shared/constants";
import { resetTestDB } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserModule } from "src/user/user.module";
import { HacksService } from "./hacks.service";
import * as https from "https";
import { ProjectsService } from "src/projects/projects.service";
import { ProjectCategoryService } from "src/projects/project-category.service";
import { randomUUID } from "crypto";
import { Hack, data } from "src/shared/interfaces";

describe("HacksService", () => {
  let models: ModelService;
  let hacksService: HacksService;
  let projectsService: ProjectsService;
  let httpService: HttpService;
  const logger = new CustomLogger(`${HacksService.name}TestSuite`);

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
        HacksService,
        ModelService,
        ProjectsService,
        ProjectCategoryService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    hacksService = module.get<HacksService>(HacksService);
    httpService = module.get<HttpService>(HttpService);
    projectsService = module.get<ProjectsService>(ProjectsService);
  }, REALLY_LONG_TIME);

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.restoreAllMocks();
  }, REALLY_LONG_TIME);

  it("should be instantiated correctly", () => {
    expect(hacksService).toBeDefined();
  });

  it(
    "should access models",
    async () => {
      expect(models.Hacks).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should create an hack for a project",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        description: "Demo Hack",
        date: new Date().getTime(),
        category: "DOS",
        issueType: "DOS",
        defiId: randomUUID(),
        fundsLost: 1,
        fundsReturned: 1,
      };
      const result = await hacksService.create(EPHEMERAL_TEST_WALLET, {
        projectId: project.id,
        ...dto,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...dto,
        },
      });

      const projectDetails = await projectsService.getProjectDetailsById(
        project.id,
        undefined,
      );
      expect(projectDetails.hacks).toEqual(
        expect.arrayContaining<Hack>([
          {
            id: expect.any(String),
            ...dto,
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find an hack by it's id",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        description: "Demo Hack",
        date: new Date().getTime(),
        category: "DOS",
        issueType: "DOS",
        defiId: randomUUID(),
        fundsLost: 1,
        fundsReturned: 1,
      };
      const result = await hacksService.create(EPHEMERAL_TEST_WALLET, {
        projectId: project.id,
        ...dto,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...dto,
        },
      });

      const hack = await hacksService.findOne(data(result).id);
      expect(data(hack)).toEqual({
        id: expect.any(String),
        ...dto,
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find all hacks",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        description: "Demo Hack",
        date: new Date().getTime(),
        category: "DOS",
        issueType: "DOS",
        defiId: randomUUID(),
        fundsLost: 1,
        fundsReturned: 1,
      };
      const result = await hacksService.create(EPHEMERAL_TEST_WALLET, {
        projectId: project.id,
        ...dto,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...dto,
        },
      });

      const hacks = await hacksService.findAll();
      expect(data(hacks)).toEqual(
        expect.arrayContaining([
          {
            id: data(result).id,
            ...dto,
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update an hack",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        description: "Demo Hack",
        date: new Date().getTime(),
        category: "DOS",
        issueType: "DOS",
        defiId: randomUUID(),
        fundsLost: 1,
        fundsReturned: 1,
      };
      const result = await hacksService.create(EPHEMERAL_TEST_WALLET, {
        projectId: project.id,
        ...dto,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...dto,
        },
      });

      const { id, ...props } = data(result);

      const newDate = new Date().getTime();

      const update = await hacksService.update(id, {
        ...props,
        date: newDate,
      });

      expect(update).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...props,
          date: newDate,
        },
      });

      const hack = await hacksService.findOne(data(update).id);
      expect(data(hack)).toEqual({
        id: expect.any(String),
        ...props,
        date: newDate,
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should delete an hack",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        description: "Demo Hack",
        date: new Date().getTime(),
        category: "DOS",
        issueType: "DOS",
        defiId: randomUUID(),
        fundsLost: 1,
        fundsReturned: 1,
      };
      const result = await hacksService.create(EPHEMERAL_TEST_WALLET, {
        projectId: project.id,
        ...dto,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...dto,
        },
      });

      const { id } = data(result);

      const deleted = await hacksService.remove(id);

      expect(deleted).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const hack = await hacksService.findOne(id);
      expect(data(hack)).toBeUndefined();
    },
    REALLY_LONG_TIME,
  );
});
