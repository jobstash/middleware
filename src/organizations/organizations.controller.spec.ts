import { Test, TestingModule } from "@nestjs/testing";
import { OrganizationsController } from "./organizations.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { OrganizationsService } from "./organizations.service";
import { OrgListParams } from "./dto/org-list.input";
import { Integer } from "neo4j-driver";
import {
  OrgFilterConfigs,
  OrgListResult,
  Organization,
  ShortOrg,
  OrgProject,
} from "src/shared/types";
import { hasDuplicates } from "src/shared/helpers";
import { isRight } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Response } from "express";
import { ModelService } from "src/model/model.service";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import { Auth0Module } from "src/auth0/auth0.module";
import { AuthModule } from "src/auth/auth.module";
import { forwardRef } from "@nestjs/common";
import { UserModule } from "src/user/user.module";

describe("OrganizationsController", () => {
  let controller: OrganizationsController;
  let models: ModelService;

  const projectHasArrayPropsDuplication = (
    project: OrgProject,
    orgId: string,
  ): boolean => {
    const hasDuplicateAudits = hasDuplicates(
      project.audits,
      `Audit for Project ${project.id} for Org ${orgId}`,
      a => a.id?.toLowerCase(),
      a => JSON.stringify(a),
    );
    const hasDuplicateHacks = hasDuplicates(
      project.hacks,
      `Hack for Project ${project.id} for Org ${orgId}`,
      h => h.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateChains = hasDuplicates(
      project.chains,
      `Chain for Project ${project.id} for Org ${orgId}`,
      c => c.id,
      a => JSON.stringify(a),
    );
    expect(hasDuplicateAudits).toBe(false);
    expect(hasDuplicateHacks).toBe(false);
    expect(hasDuplicateChains).toBe(false);
    return hasDuplicateAudits && hasDuplicateHacks && hasDuplicateChains;
  };

  const olrHasArrayPropsDuplication = (
    orgListResult: OrgListResult,
  ): boolean => {
    const hasDuplicateProjects = hasDuplicates(
      orgListResult.projects,
      `Projects for Org ${orgListResult.orgId}`,
      p => p.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateTechs = hasDuplicates(
      orgListResult.tags,
      `Technologies for Org ${orgListResult.orgId}`,
      x => x.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateInvestors = hasDuplicates(
      orgListResult.investors,
      `Investor for Org ${orgListResult.orgId}`,
      i => i.id,
      a => JSON.stringify(a),
    );
    const hasDuplicateFundingRounds = hasDuplicates(
      orgListResult.fundingRounds,
      `Funding Rounds for Org ${orgListResult.orgId}`,
      x => x.id,
      a => JSON.stringify(a),
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

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        Auth0Module,
        AuthModule,
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
            }) as NeogmaModuleOptions,
        }),
      ],
      controllers: [OrganizationsController],
      providers: [OrganizationsService, ModelService],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<OrganizationsController>(OrganizationsController);
  }, 3000000);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should access models", async () => {
    expect(models.Organizations.findMany).toBeDefined();
    expect(
      (await models.Organizations.findMany()).length,
    ).toBeGreaterThanOrEqual(1);
  }, 3000000);

  it("should get orgs list with no org and array property duplication", async () => {
    const params: OrgListParams = {
      ...new OrgListParams(),
      page: 1,
      limit: Number(Integer.MAX_VALUE),
    };
    const res = await controller.getOrgsListWithSearch(params, undefined);

    expect(res).toEqual({
      page: 1,
      count: expect.any(Number),
      total: expect.any(Number),
      data: expect.any(Array<Organization>),
    });

    hasDuplicates(
      res.data,
      "Organization with orgId",
      x => x.orgId,
      x => JSON.stringify(x),
    );
  }, 300000);

  it("should get org details with no array property duplication", async () => {
    const params: OrgListParams = {
      ...new OrgListParams(),
      page: 1,
      limit: 1,
      order: "desc",
      orderBy: "rating",
    };

    const result = await controller.getOrgsListWithSearch(params, undefined);

    const org = result.data[0];

    const res: Partial<Response> = {};

    const details = await controller.getOrgDetailsById(
      org.orgId,
      res as Response,
      undefined,
    );

    expect(details).toBeDefined();

    expect(olrHasArrayPropsDuplication(details)).toBe(false);
  }, 300000);

  it("should respond with the correct page ", async () => {
    const page = 1;
    const params: OrgListParams = {
      ...new OrgListParams(),
      page: page,
      limit: 1,
    };

    const res = await controller.getOrgsListWithSearch(params, undefined);

    expect(res.page).toEqual(page);
  }, 300000);

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
      orderBy: "headcountEstimate",
    };

    const matchesHeadCountRange = (orgListResult: ShortOrg): boolean => {
      if (typeof orgListResult.headcountEstimate === "number") {
        return (
          minHeadCount <= orgListResult.headcountEstimate &&
          orgListResult.headcountEstimate <= maxHeadCount
        );
      } else {
        return true;
      }
    };

    const res = await controller.getOrgsListWithSearch(params, undefined);
    const results = res.data;
    expect(results.every(x => matchesHeadCountRange(x) === true)).toBe(true);
  }, 30000000);

  it("should get correctly formatted filter configs", async () => {
    const configs = await controller.getFilterConfigs(undefined);

    expect(configs).toBeDefined();

    const validationResult =
      OrgFilterConfigs.OrgFilterConfigsType.decode(configs);
    if (isRight(validationResult)) {
      const validatedResult = validationResult.right;
      expect(validatedResult).toEqual(configs);
    } else {
      report(validationResult).forEach(x => {
        throw new Error(x);
      });
    }
  }, 3000000);
});
