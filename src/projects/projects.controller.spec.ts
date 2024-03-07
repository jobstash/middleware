import { Test, TestingModule } from "@nestjs/testing";
import { ProjectsController } from "./projects.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { ProjectsService } from "./projects.service";
import { ProjectListParams } from "./dto/project-list.input";
import { Integer } from "neo4j-driver";
import {
  ProjectFilterConfigs,
  ProjectDetails,
  Project,
  ProjectMoreInfo,
  data,
} from "src/shared/interfaces";
import {
  hasDuplicates,
  printDuplicateItems,
  resetTestDB,
} from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Response } from "express";
import { ModelService } from "src/model/model.service";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ProjectCategoryService } from "./project-category.service";
import { REALLY_LONG_TIME } from "src/shared/constants";
import { ProjectProps } from "src/shared/models";
import { HttpModule, HttpService } from "@nestjs/axios";
import { forwardRef } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { AuthService } from "src/auth/auth.service";
import { ModelModule } from "src/model/model.module";
import { UserModule } from "src/user/user.module";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as https from "https";

describe("ProjectsController", () => {
  let controller: ProjectsController;
  let models: ModelService;
  let httpService: HttpService;
  let projectId;
  const logger = new CustomLogger(`${ProjectsController.name}TestSuite`);

  const projectHasArrayPropsDuplication = (
    project: ProjectDetails,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project?.audits,
      a => a.id.toLowerCase(),
      `Audit for Project ${project.id}`,
    );
    const hasDuplicateHacks = hasDuplicates(
      project?.hacks,
      h => h.id,
      `Hack for Project ${project.id}`,
    );
    const hasDuplicateChains = hasDuplicates(
      project?.chains,
      c => c.id,
      `Chain for Project ${project.id}`,
    );

    expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    return hasDuplicateAudits && hasDuplicateHacks && hasDuplicateChains;
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
      controllers: [ProjectsController],
      providers: [
        AuthService,
        JwtService,
        ModelService,
        ProjectsService,
        OrganizationsService,
        ProjectCategoryService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<ProjectsController>(ProjectsController);
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
    "should create a project",
    async () => {
      const info = {
        orgId: "345",
        name: "JobStash",
        category: "Services",
        tvl: null,
        monthlyFees: null,
        monthlyActiveUsers: 400,
        monthlyRevenue: null,
        monthlyVolume: null,
        description: "#1 Crypto Native Job Aggregator",
        website: "https://jobstash.xyz",
        logo: "https://jobstash.xyz",
        twitter: "https://twitter.com/jobstash_xyz",
        discord: null,
        github: null,
        telegram: "https://t.me/jobstashxyz",
        docs: null,
        isMainnet: false,
        tokenAddress: null,
        tokenSymbol: null,
        defiLlamaId: null,
        defiLlamaParent: null,
        defiLlamaSlug: null,
      };
      const result = await controller.createProject(info);

      expect(result.success).toBe(true);

      const project = data(result);

      expect(project).toEqual({
        id: expect.any(String),
        name: "JobStash",
        logo: "https://jobstash.xyz",
        tokenSymbol: null,
        tvl: null,
        monthlyVolume: null,
        monthlyFees: null,
        monthlyRevenue: null,
        monthlyActiveUsers: 400,
        isMainnet: false,
        orgId: "345",
        description: "#1 Crypto Native Job Aggregator",
        defiLlamaId: null,
        defiLlamaSlug: null,
        defiLlamaParent: null,
        tokenAddress: null,
        createdTimestamp: expect.any(Number),
        updatedTimestamp: null,
      });

      projectId = project.id;
    },
    REALLY_LONG_TIME,
  );

  it(
    "should update a project",
    async () => {
      const info = {
        orgId: "345",
        name: "JobStash",
        category: "Services",
        tvl: null,
        monthlyFees: null,
        monthlyActiveUsers: 500,
        monthlyRevenue: null,
        monthlyVolume: null,
        description: "#1 Crypto Native Job Aggregator",
        website: "https://jobstash.xyz",
        logo: "https://jobstash.xyz",
        twitter: "https://twitter.com/jobstash_xyz",
        discord: null,
        github: null,
        telegram: "https://t.me/jobstashxyz",
        docs: null,
        isMainnet: false,
        tokenAddress: null,
        tokenSymbol: null,
        defiLlamaId: null,
        defiLlamaParent: null,
        defiLlamaSlug: null,
      };
      const result = await controller.updateProject(projectId, info);

      expect(result.success).toBe(true);

      const project = data(result);

      expect(project).toEqual({
        id: expect.any(String),
        name: "JobStash",
        logo: "https://jobstash.xyz",
        tokenSymbol: null,
        tvl: null,
        monthlyVolume: null,
        monthlyFees: null,
        monthlyRevenue: null,
        monthlyActiveUsers: 500,
        isMainnet: false,
        orgId: "345",
        description: "#1 Crypto Native Job Aggregator",
        defiLlamaId: null,
        defiLlamaSlug: null,
        defiLlamaParent: null,
        tokenAddress: null,
        createdTimestamp: expect.any(Number),
        updatedTimestamp: expect.any(Number),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should delete a project",
    async () => {
      const result = await controller.deleteProject(projectId);

      expect(result.success).toBe(true);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get projects list with no duplication",
    async () => {
      const params: ProjectListParams = {
        ...new ProjectListParams(),
        page: 1,
        limit: Number(Integer.MAX_VALUE),
      };
      const res = await controller.getProjectsListWithSearch(params, undefined);

      const uuids = res.data.map(project => project.id + project.orgId);
      const setOfUuids = new Set([...uuids]);

      expect(res).toEqual({
        page: 1,
        count: expect.any(Number),
        total: expect.any(Number),
        data: expect.any(Array<Project>),
      });

      printDuplicateItems(setOfUuids, uuids, "Project with ID");

      expect(setOfUuids.size).toBe(uuids.length);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get correctly formatted filter configs",
    async () => {
      const configs = await controller.getFilterConfigs(undefined);

      expect(configs).toBeDefined();

      const validationResult =
        ProjectFilterConfigs.ProjectFilterConfigsType.decode(configs);
      if (isRight(validationResult)) {
        // The result is of the expected type
        const validatedResult = validationResult.right;
        expect(validatedResult).toEqual(configs);
      } else {
        // The result is not of the expected type
        report(validationResult).forEach(x => {
          throw new Error(x);
        });
      }
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get project details with no array property duplication",
    async () => {
      const params: ProjectListParams = {
        ...new ProjectListParams(),
        page: 1,
        limit: 1,
      };

      const project = (
        await controller.getProjectsListWithSearch(params, undefined)
      ).data[0];

      const res: Partial<Response> = {};

      const details = await controller.getProjectDetailsById(
        project.id,
        res as Response,
        undefined,
      );

      expect(projectHasArrayPropsDuplication(details)).toBe(false);

      expect(project.id).toBe(details.id);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get project by category",
    async () => {
      const result = await controller.getProjectsByCategory("Dexes");

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<ProjectProps>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get project competitors",
    async () => {
      const params: ProjectListParams = {
        ...new ProjectListParams(),
        page: 1,
        limit: 1,
      };

      const project = (
        await controller.getProjectsListWithSearch(params, undefined)
      ).data[0];

      const competitors = await controller.getProjectCompetitors(
        project.id,
        undefined,
      );

      expect(competitors).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<ProjectProps>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get projects for an org",
    async () => {
      const competitors = await controller.getProjectsByOrgId("120");

      expect(competitors).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<ProjectProps>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should search for projects",
    async () => {
      const competitors = await controller.searchProjects("AAVE");

      expect(competitors).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<ProjectProps>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should prefill project info from defillama",
    async () => {
      const info = await controller.getProjectDetailsFromDefillama(
        "https://api.llama.fi/protocol/hyphen",
      );

      expect(data(info).name).toBe("Hyphen");
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get project details",
    async () => {
      const params: ProjectListParams = {
        ...new ProjectListParams(),
        page: 1,
        limit: 1,
      };

      const project = (
        await controller.getProjectsListWithSearch(params, undefined)
      ).data[0];

      const res: Partial<Response> = {};

      const details = await controller.getProjectDetails(
        project.id,
        res as Response,
      );

      expect(details).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(ProjectMoreInfo),
      });
    },
    REALLY_LONG_TIME,
  );
});
