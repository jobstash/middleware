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
      workModes: ["remote", "fully_remote"],
      workModeLabels: { remote: "REMOTE" },
      availability: ["place:geonames:2759794", "place:unm49:528"],
      availabilityLabels: {
        "place:geonames:2759794": "Amsterdam",
        "place:unm49:528": "Netherlands",
      },
      cities: ["place:geonames:2759794"],
      cityLabels: { "place:geonames:2759794": "Amsterdam" },
      regions: ["place:geonames:2749879"],
      regionLabels: { "place:geonames:2749879": "North Holland" },
      countries: ["place:unm49:528"],
      countryLabels: { "place:unm49:528": "Netherlands" },
      continents: ["place:geonames:6255148"],
      continentLabels: { "place:geonames:6255148": "Europe" },
      timezones: ["tz:Europe/Amsterdam"],
      timezoneLabels: { "tz:Europe/Amsterdam": "Europe/Amsterdam" },
      collaborationHours: ["utc-08", "utc-17"],
      collaborationHourLabels: {
        "utc-08": "08:00 UTC",
        "utc-17": "17:00 UTC",
      },
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
      workModes: {
        options: [
          { label: "100% Remote", value: "fully-remote" },
          { label: "Remote", value: "remote" },
        ],
      },
      availability: {
        options: [
          {
            label: "Amsterdam",
            value: "amsterdam",
            aliases: ["place:geonames:2759794"],
          },
          {
            label: "Netherlands",
            value: "netherlands",
            aliases: ["place:unm49:528"],
          },
        ],
      },
      cities: {
        options: [
          {
            label: "Amsterdam",
            value: "amsterdam",
            aliases: ["place:geonames:2759794"],
          },
        ],
      },
      regions: {
        options: [
          {
            label: "North Holland",
            value: "north-holland",
            aliases: ["place:geonames:2749879"],
          },
        ],
      },
      countries: {
        options: [
          {
            label: "Netherlands",
            value: "netherlands",
            aliases: ["place:unm49:528"],
          },
        ],
      },
      continents: {
        options: [
          {
            label: "Europe",
            value: "europe",
            aliases: ["place:geonames:6255148"],
          },
        ],
      },
      timezones: {
        options: [
          {
            label: "Europe/Amsterdam",
            value: "europe-amsterdam",
            aliases: ["tz:Europe/Amsterdam"],
          },
        ],
      },
      collaborationHours: {
        options: [
          { label: "08:00 UTC", value: "utc-08" },
          { label: "17:00 UTC", value: "utc-17" },
        ],
      },
      investors: { options: [{ label: "Paradigm", value: "paradigm" }] },
      ecosystems: { options: [{ label: "Ethereum", value: "Ethereum" }] },
      organizations: { options: [{ label: "Acme", value: "acme" }] },
      seniority: { options: [{ label: "Senior", value: "senior" }] },
    });
    expect(result.tags.options).toEqual([
      { label: "Solidity", value: "solidity" },
      { label: "TypeScript", value: "typescript" },
    ]);
    for (const facet of [
      "availability",
      "cities",
      "regions",
      "countries",
      "continents",
      "timezones",
    ] as const) {
      for (const option of result[facet].options) {
        expect(String(option.value)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(String(option.value)).not.toMatch(/[:/]/);
      }
    }
  });

  it("deduplicates provider IDs that share one public geographic slug", () => {
    const result = new JobFilterConfigsEntity({
      cities: ["place:geonames:2950159", "place:internal:berlin"],
      cityLabels: {
        "place:geonames:2950159": "Berlin",
        "place:internal:berlin": "Berlin",
      },
    }).getProperties();

    expect(result.cities.options).toEqual([
      {
        label: "Berlin",
        value: "berlin",
        aliases: ["place:geonames:2950159", "place:internal:berlin"],
      },
    ]);
  });

  it("preserves projected facet keys instead of re-slugifying labels", () => {
    const result = new JobFilterConfigsEntity({
      classifications: ["engineering-management"],
      classificationLabels: {
        "engineering-management": "ENGINEERING_MANAGEMENT",
      },
      commitments: ["fulltime"],
      commitmentLabels: { fulltime: "FULL_TIME" },
      organizations: ["wave-mobile-money-inc"],
      organizationLabels: {
        "wave-mobile-money-inc": "Wave Mobile Money Inc.",
      },
      workModes: ["remote"],
      workModeLabels: { remote: "REMOTE" },
      fundingRounds: ["series-a"],
      fundingRoundLabels: { "series-a": "Series A" },
    }).getProperties();

    expect(result.classifications.options).toEqual([
      {
        label: "Engineering Management",
        value: "engineering-management",
      },
    ]);
    expect(result.commitments.options).toEqual([
      { label: "Full Time", value: "fulltime" },
    ]);
    expect(result.organizations.options).toEqual([
      {
        label: "Wave Mobile Money Inc.",
        value: "wave-mobile-money-inc",
      },
    ]);
    expect(result.workModes.options).toEqual([
      { label: "Remote", value: "remote" },
    ]);
    expect(result.fundingRounds.options).toEqual([
      { label: "Series A", value: "series-a" },
    ]);
  });

  it("round-trips organization ranges and facets", () => {
    const result = new OrgFilterConfigsEntity({
      minHeadCount: 10,
      maxHeadCount: 100,
      fundingRounds: ["Seed"],
      fundingStages: ["Series A"],
      minCurrentMaintainers: 2,
      maxCurrentMaintainers: 20,
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
      fundingStages: {
        options: [{ label: "Series A", value: "series-a" }],
      },
      currentMaintainers: {
        value: {
          lowest: { value: 2, paramKey: "minCurrentMaintainers" },
          highest: { value: 20, paramKey: "maxCurrentMaintainers" },
        },
      },
      newActiveLeads: { paramKey: "newActiveLeads" },
      steppedDownLeads: { paramKey: "steppedDownLeads" },
      movedLeads: { paramKey: "movedLeads" },
      earlyLeadDepartures: { paramKey: "earlyLeadDepartures" },
      recentlyFunded: { paramKey: "recentlyFunded" },
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
