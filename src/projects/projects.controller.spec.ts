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
} from "src/shared/interfaces";
import { hasDuplicates, printDuplicateItems } from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Response } from "express";
import { ModelService } from "src/model/model.service";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ProjectCategoryService } from "./project-category.service";
import { REALLY_LONG_TIME } from "src/shared/constants";

describe("ProjectsController", () => {
  let controller: ProjectsController;
  let models: ModelService;

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
              host: configService.get<string>("NEO4J_HOST"),
              password: configService.get<string>("NEO4J_PASSWORD"),
              port: configService.get<string>("NEO4J_PORT"),
              scheme: configService.get<string>("NEO4J_SCHEME"),
              username: configService.get<string>("NEO4J_USERNAME"),
              database: configService.get<string>("NEO4J_DATABASE"),
            } as NeogmaModuleOptions),
        }),
      ],
      controllers: [ProjectsController],
      providers: [
        ProjectsService,
        ProjectCategoryService,
        OrganizationsService,
        ModelService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<ProjectsController>(ProjectsController);
  });

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
    "should get projects list with no duplication",
    async () => {
      const params: ProjectListParams = {
        ...new ProjectListParams(),
        page: 1,
        limit: Number(Integer.MAX_VALUE),
      };
      const res = await controller.getProjectsListWithSearch(params);

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
      const configs = await controller.getFilterConfigs();

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

      const project = (await controller.getProjectsListWithSearch(params))
        .data[0];

      const res: Partial<Response> = {};

      const details = await controller.getProjectDetailsById(
        project.id,
        res as Response,
      );

      expect(projectHasArrayPropsDuplication(details)).toBe(false);
    },
    REALLY_LONG_TIME,
  );
});
