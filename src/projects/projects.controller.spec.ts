import { Test, TestingModule } from "@nestjs/testing";
import { ProjectsController } from "./projects.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { Neo4jConnection, Neo4jModule } from "nest-neo4j/dist";
import { ProjectsService } from "./projects.service";
import { ProjectListParams } from "./dto/project-list.input";
import { Integer } from "neo4j-driver";
import { ProjectProperties } from "src/shared/interfaces";
import { printDuplicateItems } from "src/shared/helpers";
import { BackendService } from "src/backend/backend.service";
import { createMock } from "@golevelup/ts-jest";

describe("ProjectsController", () => {
  let controller: ProjectsController;

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
});
