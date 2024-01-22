import { Test, TestingModule } from "@nestjs/testing";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { Integer } from "neo4j-driver";
import { JobListResult, ProjectWithRelations } from "src/shared/interfaces";
import { hasDuplicates, printDuplicateItems } from "src/shared/helpers";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import envSchema from "src/env-schema";
import { ModelService } from "src/model/model.service";
import { ModelModule } from "src/model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";

describe("PublicController", () => {
  let controller: PublicController;
  let models: ModelService;

  const projectHasArrayPropsDuplication = (
    project: ProjectWithRelations,
    jobPostUUID: string,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      a => a.id,
      `Audit for Project ${project.id} for Jobpost ${jobPostUUID}`,
    );
    const hasDuplicateHacks = hasDuplicates(
      project.hacks,
      h => h.id,
      `Hack for Project ${project.id} for Jobpost ${jobPostUUID}`,
    );
    const hasDuplicateChains = hasDuplicates(
      project.chains,
      c => c.id,
      `Chain for Project ${project.id} for Jobpost ${jobPostUUID}`,
    );

    // TODO: Uncomment this when the new backend is in place
    // expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    return hasDuplicateAudits && hasDuplicateHacks && hasDuplicateChains;
  };

  const jlrHasArrayPropsDuplication = (
    jobListResult: JobListResult,
  ): boolean => {
    const hasDuplicateProjects = hasDuplicates(
      jobListResult.organization.projects,
      p => p.id,
      `Org Projects for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateTechs = hasDuplicates(
      jobListResult.tags,
      x => x.normalizedName,
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateInvestors = hasDuplicates(
      jobListResult.organization.investors,
      i => i.id,
      `Investor for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateFundingRounds = hasDuplicates(
      jobListResult.organization.fundingRounds,
      x => x.id,
      `Org Funding Rounds for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasProjectsWithUniqueProps =
      jobListResult.organization.projects.every(
        x =>
          projectHasArrayPropsDuplication(x, jobListResult.shortUUID) === false,
      ) === true;
    expect(hasDuplicateProjects).toBe(false);
    expect(hasDuplicateTechs).toBe(false);
    expect(hasDuplicateInvestors).toBe(false);
    expect(hasDuplicateFundingRounds).toBe(false);
    expect(hasProjectsWithUniqueProps).toBe(true);
    return (
      hasDuplicateProjects &&
      hasDuplicateTechs &&
      hasDuplicateInvestors &&
      hasDuplicateFundingRounds &&
      hasProjectsWithUniqueProps
    );
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
        CacheModule.register({ isGlobal: true }),
        ModelModule,
      ],
      controllers: [PublicController],
      providers: [PublicService, ModelService],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<PublicController>(PublicController);
  }, 1000000);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should access models", async () => {
    expect(models.Organizations.findMany).toBeDefined();
    expect(
      (await models.Organizations.findMany()).length,
    ).toBeGreaterThanOrEqual(1);
  }, 100000);

  it("should get external all jobs list with no jobpost and array property duplication", async () => {
    const params = {
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    const res = await controller.getAllJobs(params);

    const uuids = res.data.map(job => job.shortUUID);
    const setOfUuids = new Set([...uuids]);

    expect(res).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<JobListResult>),
    });

    printDuplicateItems(setOfUuids, uuids, "StructuredJobpost with UUID");

    expect(uuids.length).toBe(setOfUuids.size);

    expect(res.data.every(x => jlrHasArrayPropsDuplication(x) === false)).toBe(
      true,
    );
  }, 60000000);
});
