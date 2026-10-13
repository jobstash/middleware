import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JobFeedParams } from "./job-feed.input";
import { shouldGroupJobs } from "./job-feed.input";
import { JobListParams } from "./job-list.input";
import { ORGANIZATION_VERTICALS } from "src/shared/organization-classifications";

describe("feed grouping policy", () => {
  it.each(["tags", "organizations", "projects", "cities"])(
    "does not group %s",
    key => {
      expect(shouldGroupJobs({ [key]: ["value"], workModes: ["remote"] })).toBe(
        false,
      );
      expect(shouldGroupJobs({ [key]: [] })).toBe(true);
    },
  );
  it.each([
    "classifications",
    "organizationClassifications",
    "commitments",
    "seniority",
    "countries",
    "regions",
    "continents",
    "timezones",
    "workModes",
    "fundingRounds",
    "investors",
    "fundingStages",
    "chains",
    "collaborationHours",
  ])("groups %s", key => {
    expect(shouldGroupJobs({ [key]: ["value"] })).toBe(true);
  });
  it.each([
    "audits",
    "hacks",
    "token",
    "onboardIntoWeb3",
    "recentlyFunded",
    "newActiveLeads",
    "steppedDownLeads",
    "movedLeads",
    "earlyLeadDepartures",
  ])("groups boolean %s", key => {
    expect(shouldGroupJobs({ [key]: true })).toBe(true);
  });
  it.each([
    "minSalaryRange",
    "maxSalaryRange",
    "minHeadCount",
    "maxHeadCount",
    "minCurrentMaintainers",
    "maxCurrentMaintainers",
    "minActiveLeads",
    "maxActiveLeads",
    "minTvl",
    "maxTvl",
    "minMonthlyVolume",
    "maxMonthlyRevenue",
  ])("groups range %s", key => {
    expect(shouldGroupJobs({ [key]: 10 })).toBe(true);
  });
  it.each([
    { query: "engineer" },
    { titleQuery: "engineer" },
    { expertJobs: true },
    { organizationId: "org" },
    { orderBy: "salary" },
    { order: "asc" },
  ])("keeps individual results for %p", params => {
    expect(shouldGroupJobs(params as Partial<JobListParams>)).toBe(false);
  });
  it("ignores blank input and disabled expert filter", () => {
    expect(shouldGroupJobs({ query: " ", tags: [""], expertJobs: false })).toBe(
      true,
    );
    expect(shouldGroupJobs({ publicationDate: "past-3-months" })).toBe(true);
  });
});

describe("organization feed input", () => {
  it("ignores the retired stack cap query parameter", async () => {
    const value = plainToInstance(JobFeedParams, {
      jobsPerOrganization: "25",
      pillar: "remote",
    });
    expect(await validate(value, { whitelist: true })).toEqual([]);
    expect(value.pillar).toBe("remote");
    expect(value).not.toHaveProperty("jobsPerOrganization");
  });
});

describe("organization classification input", () => {
  it.each([JobListParams, JobFeedParams])(
    "accepts canonical comma-separated and repeated values in %p",
    async Input => {
      for (const query of [
        ORGANIZATION_VERTICALS.join(","),
        [...ORGANIZATION_VERTICALS],
      ]) {
        const value = plainToInstance(Input, {
          organizationClassifications: query,
          classifications: "engineering",
        });
        expect(await validate(value, { whitelist: true })).toEqual([]);
        expect(value.organizationClassifications).toEqual(
          ORGANIZATION_VERTICALS,
        );
        expect(value.classifications).toEqual(["engineering"]);
      }
    },
  );

  it.each(["web2", "engineering", "AI", "ai_robotics", "ai,unknown"])(
    "rejects noncanonical organization classification %s",
    async organizationClassifications => {
      const errors = await validate(
        plainToInstance(JobListParams, { organizationClassifications }),
      );
      expect(errors.map(error => error.property)).toContain(
        "organizationClassifications",
      );
    },
  );
});
