import {
  JobFilterConfigsEntity,
  OrgFilterConfigsEntity,
  ProjectFilterConfigsEntity,
} from "./index";

describe("filter config response contracts", () => {
  it("round-trips every job range and option family", () => {
    const result = new JobFilterConfigsEntity({
      minSalaryRange: 90_000,
      maxSalaryRange: 150_000,
      minHeadCount: 10,
      maxHeadCount: 100,
      minTvl: 1_000,
      maxTvl: 2_000,
      minMonthlyVolume: 100,
      maxMonthlyVolume: 200,
      minMonthlyFees: 10,
      maxMonthlyFees: 20,
      minMonthlyRevenue: 5,
      maxMonthlyRevenue: 15,
      tags: ["TypeScript", "Solidity"],
      fundingRounds: ["Seed"],
      projects: ["Alpha"],
      classifications: ["ENGINEERING"],
      commitments: ["FULL_TIME"],
      chains: ["Ethereum"],
      locations: ["REMOTE"],
      investors: ["Paradigm"],
      ecosystems: ["Ethereum"],
      organizations: ["Acme"],
      seniority: ["Senior"],
    }).getProperties();

    expect(result).toMatchObject({
      salary: {
        value: {
          lowest: { value: 90_000, paramKey: "minSalaryRange" },
          highest: { value: 150_000, paramKey: "maxSalaryRange" },
        },
      },
      headcountEstimate: {
        value: {
          lowest: { value: 10, paramKey: "minHeadCount" },
          highest: { value: 100, paramKey: "maxHeadCount" },
        },
      },
      tvl: {
        value: {
          lowest: { value: 1_000, paramKey: "minTvl" },
          highest: { value: 2_000, paramKey: "maxTvl" },
        },
      },
      monthlyVolume: {
        value: {
          lowest: { value: 100, paramKey: "minMonthlyVolume" },
          highest: { value: 200, paramKey: "maxMonthlyVolume" },
        },
      },
      monthlyFees: {
        value: {
          lowest: { value: 10, paramKey: "minMonthlyFees" },
          highest: { value: 20, paramKey: "maxMonthlyFees" },
        },
      },
      monthlyRevenue: {
        value: {
          lowest: { value: 5, paramKey: "minMonthlyRevenue" },
          highest: { value: 15, paramKey: "maxMonthlyRevenue" },
        },
      },
      fundingRounds: { options: [{ label: "Seed", value: "seed" }] },
      projects: { options: [{ label: "Alpha", value: "alpha" }] },
      classifications: {
        options: [{ label: "Engineering", value: "engineering" }],
      },
      commitments: {
        options: [{ label: "Full Time", value: "fulltime" }],
      },
      chains: { options: [{ label: "Ethereum", value: "ethereum" }] },
      locations: { options: [{ label: "Remote", value: "remote" }] },
      investors: { options: [{ label: "Paradigm", value: "paradigm" }] },
      ecosystems: { options: [{ label: "Ethereum", value: "Ethereum" }] },
      organizations: { options: [{ label: "Acme", value: "acme" }] },
      seniority: { options: [{ label: "Senior", value: "senior" }] },
    });
    expect(result.tags.options).toEqual([
      { label: "TypeScript", value: "typescript" },
      { label: "Solidity", value: "solidity" },
    ]);
  });

  it("round-trips organization ranges and facets", () => {
    const result = new OrgFilterConfigsEntity({
      minHeadCount: 10,
      maxHeadCount: 100,
      fundingRounds: ["Seed"],
      investors: ["Paradigm"],
      ecosystems: ["Ethereum"],
      locations: ["NORTH_AMERICA"],
    }).getProperties();

    expect(result).toMatchObject({
      headcountEstimate: {
        value: {
          lowest: { value: 10, paramKey: "minHeadCount" },
          highest: { value: 100, paramKey: "maxHeadCount" },
        },
      },
      fundingRounds: { options: [{ label: "Seed", value: "seed" }] },
      investors: { options: [{ label: "Paradigm", value: "paradigm" }] },
      ecosystems: { options: [{ label: "Ethereum", value: "ethereum" }] },
      locations: {
        options: [{ label: "North America", value: "northamerica" }],
      },
    });
  });

  it("round-trips every project range and facet", () => {
    const result = new ProjectFilterConfigsEntity({
      minTvl: 1_000,
      maxTvl: 2_000,
      minMonthlyVolume: 100,
      maxMonthlyVolume: 200,
      minMonthlyFees: 10,
      maxMonthlyFees: 20,
      minMonthlyRevenue: 5,
      maxMonthlyRevenue: 15,
      organizations: ["Acme"],
      chains: ["Ethereum"],
      ecosystems: ["Ethereum"],
      categories: ["DeFi"],
      investors: ["Paradigm"],
    }).getProperties();

    expect(result).toMatchObject({
      tvl: {
        value: {
          lowest: { value: 1_000, paramKey: "minTvl" },
          highest: { value: 2_000, paramKey: "maxTvl" },
        },
      },
      monthlyVolume: {
        value: {
          lowest: { value: 100, paramKey: "minMonthlyVolume" },
          highest: { value: 200, paramKey: "maxMonthlyVolume" },
        },
      },
      monthlyFees: {
        value: {
          lowest: { value: 10, paramKey: "minMonthlyFees" },
          highest: { value: 20, paramKey: "maxMonthlyFees" },
        },
      },
      monthlyRevenue: {
        value: {
          lowest: { value: 5, paramKey: "minMonthlyRevenue" },
          highest: { value: 15, paramKey: "maxMonthlyRevenue" },
        },
      },
      organizations: { options: [{ label: "Acme", value: "acme" }] },
      chains: { options: [{ label: "Ethereum", value: "ethereum" }] },
      ecosystems: { options: [{ label: "Ethereum", value: "ethereum" }] },
      categories: { options: [{ label: "DeFi", value: "defi" }] },
      investors: { options: [{ label: "Paradigm", value: "paradigm" }] },
    });
  });
});
