import { Test, TestingModule } from "@nestjs/testing";
import { ProjectsController } from "./projects.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { ProjectsService } from "./projects.service";
import { ProjectListParams } from "./dto/project-list.input";
import { Integer } from "neo4j-driver";
import {
  ProjectFilterConfigs,
  ProjectDetailsResult,
  Project,
  data,
  SessionObject,
} from "src/shared/interfaces";
import { createTestUser, hasDuplicates, resetTestDB } from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { ModelService } from "src/model/model.service";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ProjectCategoryService } from "./project-category.service";
import { ADMIN_SESSION_OBJECT, REALLY_LONG_TIME } from "src/shared/constants";
import { ProjectProps } from "src/shared/models";
import { HttpModule, HttpService } from "@nestjs/axios";
import { forwardRef } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { AuthService } from "src/auth/auth.service";
import { ModelModule } from "src/model/model.module";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as https from "https";
import { AuthModule } from "src/auth/auth.module";
import { GithubModule } from "src/auth/github/github.module";
import { PrivyModule } from "src/auth/privy/privy.module";
import { PrivyService } from "src/auth/privy/privy.service";
import { Auth0Module } from "src/auth0/auth0.module";
import { ScorerModule } from "src/scorer/scorer.module";
import { UserService } from "src/user/user.service";
import { ProfileModule } from "src/auth/profile/profile.module";
import { PermissionService } from "src/user/permission.service";

describe("ProjectsController", () => {
  let controller: ProjectsController;
  let models: ModelService;
  let httpService: HttpService;
  let projectId: string;

  let USER_SESSION_OBJECT: SessionObject;
  const logger = new CustomLogger(`${ProjectsController.name}TestSuite`);

  const projectHasArrayPropsDuplication = (
    project: ProjectDetailsResult,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project?.audits,
      `Audit for Project ${project.id}`,
      a => a.id.toLowerCase(),
      a => JSON.stringify(a),
    );
    const hasDuplicateHacks = hasDuplicates(
      project?.hacks,
      `Hack for Project ${project.id}`,
      h => h.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateChains = hasDuplicates(
      project?.chains,
      `Chain for Project ${project.id}`,
      c => c.id,
      a => JSON.stringify(a),
    );

    expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    return hasDuplicateAudits && hasDuplicateHacks && hasDuplicateChains;
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        Auth0Module,
        forwardRef(() => AuthModule),
        forwardRef(() => ProfileModule),
        forwardRef(() => ScorerModule),
        forwardRef(() => PrivyModule),
        forwardRef(() => GithubModule),
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
      ],
      controllers: [ProjectsController],
      providers: [
        AuthService,
        JwtService,
        ModelService,
        ProjectsService,
        OrganizationsService,
        ProjectCategoryService,
        UserService,
        PermissionService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<ProjectsController>(ProjectsController);
    httpService = module.get<HttpService>(HttpService);

    const adminWallet = await createTestUser(
      module.get<PrivyService>(PrivyService),
      module.get<UserService>(UserService),
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
    "should create a project",
    async () => {
      const info = {
        orgId: "345",
        name: "JobStashX",
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
        tokenAddress: null,
        tokenSymbol: null,
        defiLlamaId: null,
        defiLlamaParent: null,
        defiLlamaSlug: null,
      };
      const result = await controller.createProject(USER_SESSION_OBJECT, info);

      expect(result.success).toBe(true);

      const project = data(result);

      expect(project).toEqual({
        id: expect.any(String),
        name: "JobStashX",
        normalizedName: "jobstashx",
        logo: "https://jobstash.xyz",
        tokenSymbol: null,
        tvl: null,
        monthlyVolume: null,
        monthlyFees: null,
        monthlyRevenue: null,
        monthlyActiveUsers: 400,
        orgIds: [],
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
        orgIds: [],
        name: "JobStashd",
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
        tokenAddress: null,
        tokenSymbol: null,
        defiLlamaId: null,
        defiLlamaParent: null,
        defiLlamaSlug: null,
        detectedJobsites: [],
        jobsites: [],
      };

      const result = await controller.updateProject(
        USER_SESSION_OBJECT,
        projectId,
        info,
      );

      expect(result.success).toBe(true);

      const project = data(result);

      expect(project).toEqual({
        id: expect.any(String),
        name: "JobStashd",
        normalizedName: "jobstashd",
        logo: "https://jobstash.xyz",
        tokenSymbol: null,
        tvl: null,
        monthlyVolume: null,
        monthlyFees: null,
        monthlyRevenue: null,
        monthlyActiveUsers: 500,
        orgIds: [],
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
      const result = await controller.deleteProject(
        USER_SESSION_OBJECT,
        projectId,
      );

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

      expect(res).toEqual({
        page: 1,
        count: expect.any(Number),
        total: expect.any(Number),
        data: expect.any(Array<Project>),
      });

      hasDuplicates(
        res.data,
        "Project with ID",
        x => x.id,
        x => JSON.stringify(x),
      );
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

      const details = await controller.getProjectDetailsById(
        project.id,
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
      const competitors = await controller.getProjectsByOrgId(
        USER_SESSION_OBJECT,
        "105",
      );

      expect(competitors).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.anything(),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should search for projects",
    async () => {
      const competitors = await controller.searchProjects(
        {
          categories: null,
          chains: null,
          investors: null,
          limit: 10,
          page: 1,
          tags: null,
        },
        "AAVE",
      );

      expect(competitors).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<ProjectProps>),
      });
    },
    REALLY_LONG_TIME,
  );
});
