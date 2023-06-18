import { Test, TestingModule } from "@nestjs/testing";
import { OrganizationsController } from "./organizations.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { Neo4jConnection, Neo4jModule } from "nest-neo4j/dist";
import { OrganizationsService } from "./organizations.service";
import { OrgListParams } from "./dto/org-list.input";
import { Integer } from "neo4j-driver";
import {
  OrgFilterConfigs,
  OrgListResult,
  OrganizationProperties,
  Project,
} from "src/shared/types";
import { hasDuplicates, printDuplicateItems } from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { BackendService } from "src/backend/backend.service";
import { createMock } from "@golevelup/ts-jest";
import { report } from "io-ts-human-reporter";

describe("OrganizationsController", () => {
  let controller: OrganizationsController;

  const projectHasArrayPropsDuplication = (
    project: Project,
    orgId: string,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      a => a.auditor.toLowerCase(),
      `Audit for Project ${project.id} for Org ${orgId}`,
    );
    const hasDuplicateHacks = hasDuplicates(
      project.hacks,
      h => h.id,
      `Hack for Project ${project.id} for Org ${orgId}`,
    );
    const hasDuplicateChains = hasDuplicates(
      project.chains,
      c => c.id,
      `Chain for Project ${project.id} for Org ${orgId}`,
    );
    const hasDuplicateCategories = hasDuplicates(
      project.categories,
      c => c.id,
      `Category for Project ${project.id} for Org ${orgId}`,
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

  const olrHasArrayPropsDuplication = (
    orgListResult: OrgListResult,
  ): boolean => {
    const hasDuplicateProjects = hasDuplicates(
      orgListResult.projects,
      p => p.id,
      `Projects for Org ${orgListResult.orgId}`,
    );
    const hasDuplicateTechs = hasDuplicates(
      orgListResult.technologies,
      x => x.id,
      `Technologies for Org ${orgListResult.orgId}`,
    );
    const hasDuplicateInvestors = hasDuplicates(
      orgListResult.investors,
      i => i.id,
      `Investor for Org ${orgListResult.orgId}`,
    );
    const hasDuplicateFundingRounds = hasDuplicates(
      orgListResult.fundingRounds,
      x => x.id,
      `Funding Rounds for Org ${orgListResult.orgId}`,
    );
    const hasProjectsWithUniqueProps =
      orgListResult.projects.every(
        x => projectHasArrayPropsDuplication(x, orgListResult.orgId) === false,
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
      ],
      controllers: [OrganizationsController],
      providers: [
        OrganizationsService,
        { provide: BackendService, useValue: createMock<BackendService>() },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should get orgs list with no org and array property duplication", async () => {
    const params: OrgListParams = {
      ...new OrgListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    const res = await controller.getOrgsListWithSearch(params);

    const uuids = res.data.map(org => org.orgId);
    const setOfUuids = new Set([...uuids]);

    expect(res).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<OrganizationProperties>),
    });

    printDuplicateItems(setOfUuids, uuids, "Organization with orgId");

    expect(setOfUuids.size).toBe(uuids.length);
  }, 300000);

  it("should get org details with no array property duplication", async () => {
    const params: OrgListParams = {
      ...new OrgListParams(),
      page: 1,
      limit: 1,
      order: "asc",
      orderBy: "recentJobDate",
    };

    const org = (await controller.getOrgsListWithSearch(params)).data[0];

    const details = await controller.getOrgDetailsById(org.orgId);

    expect(details).toBeDefined();

    expect(olrHasArrayPropsDuplication(details)).toBe(false);
  }, 10000);

  it("should respond with the correct page ", async () => {
    const page = 1;
    const params: OrgListParams = {
      ...new OrgListParams(),
      page: page,
      limit: 1,
    };

    const res = await controller.getOrgsListWithSearch(params);

    expect(res.page).toEqual(page);
  }, 10000);

  it("should respond with the correct results for {(min & max)HeadCount} filter", async () => {
    const minHeadCount = 1;
    const maxHeadCount = 1000;
    const params: OrgListParams = {
      ...new OrgListParams(),
      minHeadCount,
      maxHeadCount,
      page: 1,
      limit: Number(Integer.MAX_VALUE),
      order: "asc",
      orderBy: "headCount",
    };

    const matchesHeadCountRange = (
      orgListResult: OrganizationProperties,
    ): boolean => {
      if (typeof orgListResult.headCount === "number") {
        return (
          minHeadCount <= orgListResult.headCount &&
          orgListResult.headCount <= maxHeadCount
        );
      } else {
        return true;
      }
    };

    const res = await controller.getOrgsListWithSearch(params);
    const results = res.data;
    expect(results.every(x => matchesHeadCountRange(x) === true)).toBe(true);
  }, 1000000);

  it("should get correctly formatted filter configs", async () => {
    const configs = await controller.getFilterConfigs();

    expect(configs).toBeDefined();

    const validationResult =
      OrgFilterConfigs.OrgFilterConfigsType.decode(configs);
    if (isRight(validationResult)) {
      // The result is of the expected type
      const validatedResult = validationResult.right;
      expect(validatedResult).toEqual(configs);
    } else {
      // The result is not of the expected type
      report(validationResult).forEach(x => {
        console.error(x);
      });
    }
  }, 100000);
});
