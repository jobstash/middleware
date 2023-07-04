import { Test, TestingModule } from "@nestjs/testing";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { Integer } from "neo4j-driver";
import { JobListResult, Project } from "src/shared/interfaces";
import { hasDuplicates, printDuplicateItems } from "src/shared/helpers";
import { Neo4jConnection, Neo4jModule } from "nest-neo4j/dist";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import envSchema from "src/env-schema";

describe("PublicController", () => {
  let controller: PublicController;

  const projectHasArrayPropsDuplication = (
    project: Project,
    jobPostUUID: string,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      a => a?.link.toLowerCase(),
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
    const hasDuplicateCategories = hasDuplicates(
      project.categories,
      c => c.id,
      `Category for Project ${project.id} for Jobpost ${jobPostUUID}`,
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

  const jlrHasArrayPropsDuplication = (
    jobListResult: JobListResult,
  ): boolean => {
    const hasDuplicateProjects = hasDuplicates(
      jobListResult.organization.projects,
      p => p.id,
      `Org Projects for Jobpost ${jobListResult.shortUUID}`,
    );
    const hasDuplicateTechs = hasDuplicates(
      jobListResult.technologies,
      x => x.id,
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
        CacheModule.register({ isGlobal: true }),
      ],
      controllers: [PublicController],
      providers: [PublicService],
    }).compile();

    controller = module.get<PublicController>(PublicController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

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
