import { Test, TestingModule } from "@nestjs/testing";
import { ProjectsController } from "./projects.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { Neo4jConnection, Neo4jModule } from "nest-neo4j/dist";
import { ProjectsService } from "./projects.service";
import { ProjectListParams } from "./dto/project-list.input";
import { Integer } from "neo4j-driver";
import {
  Project,
  ProjectFilterConfigs,
  ProjectProperties,
} from "src/shared/interfaces";
import {
  hasDuplicates,
  inferObjectType,
  printDuplicateItems,
} from "src/shared/helpers";
import { BackendService } from "src/backend/backend.service";
import { createMock } from "@golevelup/ts-jest";
import { isRight } from "fp-ts/lib/Either";

describe("ProjectsController", () => {
  let controller: ProjectsController;

  const projectHasArrayPropsDuplication = (project: Project): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      a => a.auditor.toLowerCase(),
      `Audit for Project ${project.id}`,
    );
    const hasDuplicateHacks = hasDuplicates(
      project.hacks,
      h => h.id,
      `Hack for Project ${project.id}`,
    );
    const hasDuplicateChains = hasDuplicates(
      project.chains,
      c => c.id,
      `Chain for Project ${project.id}`,
    );
    const hasDuplicateCategories = hasDuplicates(
      project.categories,
      c => c.id,
      `Category for Project ${project.id}`,
    );
    expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    expect(hasDuplicateCategories).toBe(false);
    return (
      hasDuplicateAudits &&
      hasDuplicateHacks &&
      hasDuplicateChains &&
      hasDuplicateCategories
    );
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envSchema,
          validationOptions: {
            abortEarly: true,
          },
        }),
        Neo4jModule.forRootAsync({
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
            } as Neo4jConnection),
        }),
      ],
      controllers: [ProjectsController],
      providers: [
        ProjectsService,
        { provide: BackendService, useValue: createMock<BackendService>() },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should get projects list with no duplication", async () => {
    const params: ProjectListParams = {
      ...new ProjectListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    const res = await controller.getProjectsListWithSearch(params);

    const uuids = res.data.map(job => job.id);
    const setOfUuids = new Set([...uuids]);

    expect(res).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<ProjectProperties>),
    });

    printDuplicateItems(setOfUuids, uuids, "Project with ID");

    expect(setOfUuids.size).toBe(uuids.length);
  }, 300000);

  it("should get correctly formatted filter configs", async () => {
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
      throw new Error(
        `Error Serializing ProjectFilterConfigs! Constructor expected: \n {
          tvl: RangeFilter,
          audits: RangeFilter,
          teamSize: RangeFilter,
          monthlyFees: RangeFilter,
          hacks: SingleSelectFilter,
          token: SingleSelectFilter,
          order: SingleSelectFilter,
          monthlyVolume: RangeFilter,
          monthlyRevenue: RangeFilter,
          mainNet: SingleSelectFilter,
          orderBy: SingleSelectFilter,
          chains: MultiSelectSearchFilter,
          categories: MultiSelectSearchFilter,
          organizations: MultiSelectSearchFilter,
        } got ${inferObjectType(configs)}`,
      );
    }
  }, 100000);

  it("should get job details with no array property duplication", async () => {
    const params: ProjectListParams = {
      ...new ProjectListParams(),
      page: 1,
      limit: 1,
    };

    const project = (await controller.getProjectsListWithSearch(params))
      .data[0];

    const details = await controller.getProjectDetailsById(project.id);

    expect(projectHasArrayPropsDuplication(details)).toBe(false);
  }, 10000);
});
