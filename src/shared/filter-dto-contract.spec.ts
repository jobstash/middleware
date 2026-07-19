import {
  ArgumentMetadata,
  BadRequestException,
  Type,
  ValidationPipe,
} from "@nestjs/common";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { ChainListParams } from "src/chains/dto/chain-list.input";
import { InvestorListParams } from "src/investors/dto/investor-list.input";
import { OrgListParams } from "src/organizations/dto/org-list.input";
import { SearchOrganizationsInput } from "src/organizations/dto/search-organizations.input";
import { ProjectListParams } from "src/projects/dto/project-list.input";
import { SearchProjectsInput } from "src/projects/dto/search-projects.input";

const pipe = new ValidationPipe({ transform: true });

const transformQuery = async <T extends object>(
  metatype: Type<T>,
  value: Record<string, unknown>,
): Promise<T> =>
  pipe.transform(value, {
    type: "query",
    metatype,
    data: "",
  } as ArgumentMetadata);

describe("filter DTO HTTP contracts", () => {
  it.each([ChainListParams, InvestorListParams])(
    "coerces entity pagination for %p",
    async metatype => {
      const result = await transformQuery(metatype, {
        page: "2",
        limit: "100",
      });

      expect(result).toMatchObject({ page: 2, limit: 100 });
      await expect(
        transformQuery(metatype, { page: "not-a-number" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("coerces and validates fund list filters", async () => {
    const result = await transformQuery(InvestorListParams, {
      page: "2",
      limit: "20",
      query: "coin",
      minInvestedCapital: "10000000",
      minPortfolioCount: "5",
      hasJobs: "false",
      activityWindow: "custom",
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
      rounds: "seed,series-a",
      order: "desc",
      orderBy: "totalInvestedCapital",
    });

    expect(result).toMatchObject({
      page: 2,
      limit: 20,
      query: "coin",
      minInvestedCapital: 10_000_000,
      minPortfolioCount: 5,
      hasJobs: false,
      activityWindow: "custom",
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
      rounds: "seed,series-a",
      order: "desc",
      orderBy: "totalInvestedCapital",
    });

    await expect(
      transformQuery(InvestorListParams, { orderBy: "unknown" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transformQuery(InvestorListParams, { fromDate: "not-a-date" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe("JobListParams", () => {
    const numericProperties = [
      "minSalaryRange",
      "maxSalaryRange",
      "minHeadCount",
      "maxHeadCount",
      "minTvl",
      "maxTvl",
      "minMonthlyVolume",
      "maxMonthlyVolume",
      "minMonthlyFees",
      "maxMonthlyFees",
      "minMonthlyRevenue",
      "maxMonthlyRevenue",
      "page",
      "limit",
    ] as const;
    const booleanProperties = [
      "audits",
      "hacks",
      "token",
      "onboardIntoWeb3",
      "expertJobs",
    ] as const;
    const listProperties = [
      "tags",
      "organizations",
      "chains",
      "ecosystems",
      "projects",
      "classifications",
      "commitments",
      "fundingRounds",
      "investors",
      "seniority",
      "locations",
    ] as const;

    it.each(numericProperties)("coerces %s to a number", async property => {
      const result = await transformQuery(JobListParams, { [property]: "42" });

      expect(result[property]).toBe(42);
    });

    it.each(booleanProperties)("coerces both values for %s", async property => {
      const truthy = await transformQuery(JobListParams, {
        [property]: "true",
      });
      const falsy = await transformQuery(JobListParams, {
        [property]: "false",
      });

      expect(truthy[property]).toBe(true);
      expect(falsy[property]).toBe(false);
    });

    it.each(listProperties)(
      "splits comma-delimited %s values",
      async property => {
        const result = await transformQuery(JobListParams, {
          [property]: "first-value,second-value",
        });

        expect(result[property]).toEqual(["first-value", "second-value"]);
      },
    );

    it.each([
      "today",
      "this-week",
      "this-month",
      "past-2-weeks",
      "past-3-months",
      "past-6-months",
    ])("accepts publication date enum %s", async publicationDate => {
      const result = await transformQuery(JobListParams, { publicationDate });

      expect(result.publicationDate).toBe(publicationDate);
    });

    it.each([
      "publicationDate",
      "tvl",
      "salary",
      "fundingDate",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
      "headcountEstimate",
      "teamSize",
    ])("accepts job sort enum %s", async orderBy => {
      const result = await transformQuery(JobListParams, { orderBy });

      expect(result.orderBy).toBe(orderBy);
    });

    it("rejects negative filter bounds", async () => {
      await expect(
        transformQuery(JobListParams, { minSalaryRange: "-1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects inverted half-open ranges", async () => {
      await expect(
        transformQuery(JobListParams, {
          minSalaryRange: "100",
          maxSalaryRange: "99",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects malformed booleans and enum values", async () => {
      await expect(
        transformQuery(JobListParams, { audits: "yes" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        transformQuery(JobListParams, { orderBy: "unknown" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("keeps legacy page and limit boundaries for repository clamping", async () => {
      const result = await transformQuery(JobListParams, {
        page: "-1",
        limit: "101",
      });

      expect(result).toMatchObject({ page: -1, limit: 101 });
    });
  });

  describe("organization DTOs", () => {
    it("coerces all list endpoint value classes", async () => {
      const result = await transformQuery(OrgListParams, {
        minHeadCount: "10",
        maxHeadCount: "100",
        fundingRounds: "seed,series-a",
        investors: "paradigm,variant",
        locations: "berlin,lisbon",
        ecosystems: "ethereum,solana",
        projects: "alpha,beta",
        tags: "solidity,typescript",
        chains: "ethereum,base",
        names: "acme,beta",
        hasProjects: "false",
        order: "asc",
        orderBy: "name",
        page: "2",
        limit: "20",
        query: "acme",
      });

      expect(result).toMatchObject({
        minHeadCount: 10,
        maxHeadCount: 100,
        fundingRounds: ["seed", "series-a"],
        investors: ["paradigm", "variant"],
        locations: ["berlin", "lisbon"],
        ecosystems: ["ethereum", "solana"],
        projects: ["alpha", "beta"],
        tags: ["solidity", "typescript"],
        chains: ["ethereum", "base"],
        names: ["acme", "beta"],
        hasProjects: false,
        order: "asc",
        orderBy: "name",
        page: 2,
        limit: 20,
        query: "acme",
      });
    });

    it.each([
      "recentFundingDate",
      "headcountEstimate",
      "recentJobDate",
      "rating",
      "name",
    ])("accepts organization sort enum %s", async orderBy => {
      const result = await transformQuery(OrgListParams, { orderBy });

      expect(result.orderBy).toBe(orderBy);
    });

    it("rejects negative and inverted headcount ranges", async () => {
      await expect(
        transformQuery(OrgListParams, { minHeadCount: "-1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        transformQuery(OrgListParams, {
          minHeadCount: "100",
          maxHeadCount: "99",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("coerces false organization filters without changing their value", async () => {
      const result = await transformQuery(SearchOrganizationsInput, {
        hasJobs: "false",
        hasProjects: "false",
      });

      expect(result).toMatchObject({ hasJobs: false, hasProjects: false });
    });
  });

  describe("project DTOs", () => {
    it("coerces all list endpoint value classes", async () => {
      const result = await transformQuery(ProjectListParams, {
        minTvl: "100",
        maxTvl: "200",
        minMonthlyVolume: "10",
        maxMonthlyVolume: "20",
        minMonthlyFees: "1",
        maxMonthlyFees: "2",
        minMonthlyRevenue: "3",
        maxMonthlyRevenue: "4",
        audits: "false",
        hacks: "true",
        organizations: "acme,beta",
        investors: "paradigm,variant",
        chains: "ethereum,base",
        categories: "defi,infrastructure",
        ecosystems: "ethereum,solana",
        tags: "solidity,typescript",
        names: "alpha,beta",
        token: "false",
        order: "desc",
        orderBy: "monthlyVolume",
        page: "2",
        limit: "20",
        query: "alpha",
      });

      expect(result).toMatchObject({
        minTvl: 100,
        maxTvl: 200,
        minMonthlyVolume: 10,
        maxMonthlyVolume: 20,
        minMonthlyFees: 1,
        maxMonthlyFees: 2,
        minMonthlyRevenue: 3,
        maxMonthlyRevenue: 4,
        audits: false,
        hacks: true,
        organizations: ["acme", "beta"],
        investors: ["paradigm", "variant"],
        chains: ["ethereum", "base"],
        categories: ["defi", "infrastructure"],
        ecosystems: ["ethereum", "solana"],
        tags: ["solidity", "typescript"],
        names: ["alpha", "beta"],
        token: false,
        order: "desc",
        orderBy: "monthlyVolume",
        page: 2,
        limit: 20,
        query: "alpha",
      });
    });

    it.each([
      "tvl",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
    ])("accepts project sort enum %s", async orderBy => {
      const result = await transformQuery(ProjectListParams, { orderBy });

      expect(result.orderBy).toBe(orderBy);
    });

    it("rejects negative and inverted metric ranges", async () => {
      await expect(
        transformQuery(ProjectListParams, { minTvl: "-1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        transformQuery(ProjectListParams, { minTvl: "2", maxTvl: "1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("coerces false project filters without changing their value", async () => {
      const result = await transformQuery(SearchProjectsInput, {
        hasAudits: "false",
        hasHacks: "false",
        hasToken: "false",
      });

      expect(result).toMatchObject({
        hasAudits: false,
        hasHacks: false,
        hasToken: false,
      });
    });
  });
});
