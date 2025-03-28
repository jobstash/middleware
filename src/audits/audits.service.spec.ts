import { HttpModule, HttpService } from "@nestjs/axios";
import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TestingModule, Test } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import envSchema from "src/env-schema";
import { ModelModule } from "src/model/model.module";
import { ModelService } from "src/model/model.service";
import { EPHEMERAL_TEST_WALLET, REALLY_LONG_TIME } from "src/shared/constants";
import { resetTestDB } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AuditsService } from "./audits.service";
import * as https from "https";
import { ProjectsService } from "src/projects/projects.service";
import { ProjectCategoryService } from "src/projects/project-category.service";
import { randomUUID } from "crypto";
import { Audit, data } from "src/shared/interfaces";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";

describe("AuditsService", () => {
  let models: ModelService;
  let auditsService: AuditsService;
  let projectsService: ProjectsService;
  let httpService: HttpService;
  const logger = new CustomLogger(`${AuditsService.name}TestSuite`);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        forwardRef(() => AuthModule),
        forwardRef(() => Auth0Module),
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
        forwardRef(() => ModelModule),
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
        AuditsService,
        ModelService,
        ProjectsService,
        ProjectCategoryService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    auditsService = module.get<AuditsService>(AuditsService);
    httpService = module.get<HttpService>(HttpService);
    projectsService = module.get<ProjectsService>(ProjectsService);
  }, REALLY_LONG_TIME);

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.restoreAllMocks();
  }, REALLY_LONG_TIME);

  it("should be instantiated correctly", () => {
    expect(auditsService).toBeDefined();
  });

  it(
    "should access models",
    async () => {
      expect(models.Audits).toBeDefined();
    },
    REALLY_LONG_TIME,
  );

  it(
    "should create an audit for a project",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        name: "Demo Audit",
        date: new Date().getTime(),
        defiId: randomUUID(),
        link: "https://haveibeenpwned.com",
        techIssues: 1,
      };
      const result = await auditsService.create(EPHEMERAL_TEST_WALLET, {
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
      expect(projectDetails.audits).toEqual(
        expect.arrayContaining<Audit>([
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
    "should find an audit by it's id",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        name: "Demo Audit",
        date: new Date().getTime(),
        defiId: randomUUID(),
        link: "https://haveibeenpwned.com",
        techIssues: 1,
      };
      const result = await auditsService.create(EPHEMERAL_TEST_WALLET, {
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

      const audit = await auditsService.findOne(data(result).id);
      expect(data(audit)).toEqual({
        id: expect.any(String),
        ...dto,
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should find all audits",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        name: "Demo Audit",
        date: new Date().getTime(),
        defiId: randomUUID(),
        link: "https://haveibeenpwned.com",
        techIssues: 1,
      };
      const result = await auditsService.create(EPHEMERAL_TEST_WALLET, {
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

      const audits = await auditsService.findAll();
      expect(data(audits)).toEqual(
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
    "should update an audit",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        name: "Demo Audit",
        date: new Date().getTime(),
        defiId: randomUUID(),
        link: "https://haveibeenpwned.com",
        techIssues: 1,
      };
      const result = await auditsService.create(EPHEMERAL_TEST_WALLET, {
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

      const update = await auditsService.update(id, {
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

      const audit = await auditsService.findOne(data(update).id);
      expect(data(audit)).toEqual({
        id: expect.any(String),
        ...props,
        date: newDate,
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should delete an audit",
    async () => {
      const project = (await projectsService.getProjects())[0];
      const dto = {
        name: "Demo Audit",
        date: new Date().getTime(),
        defiId: randomUUID(),
        link: "https://haveibeenpwned.com",
        techIssues: 1,
      };
      const result = await auditsService.create(EPHEMERAL_TEST_WALLET, {
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

      const deleted = await auditsService.remove(id);

      expect(deleted).toEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const audit = await auditsService.findOne(id);
      expect(data(audit)).toBeUndefined();
    },
    REALLY_LONG_TIME,
  );
});
