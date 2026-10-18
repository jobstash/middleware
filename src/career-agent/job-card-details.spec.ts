import { projectJobCardDetails, projectJobSalary } from "./job-card-details";

describe("job card source metadata", () => {
  it("uses a verified published date, otherwise the first observation, never a scrape's unverified publish date", () => {
    const payload = { publishedTimestamp: 1_789_603_200_000, firstSeenTimestamp: 1_790_089_457_986, publishedTimestampIsVerified: false };
    expect(projectJobCardDetails({ payload }).date).toEqual({ value: "2026-09-22T15:04:17.986Z", provenance: "first_seen" });
    expect(projectJobCardDetails({ payload: { ...payload, publishedTimestampIsVerified: true } }).date)
      .toEqual({ value: "2026-09-17T00:00:00.000Z", provenance: "posted" });
    expect(projectJobCardDetails({ payload: { publishedTimestamp: payload.publishedTimestamp } }).date).toBeNull();
  });

  it("keeps original hourly bounds separate from annualized warehouse values and does not invent a missing period", () => {
    const payload = { minimumSalary: 208_000, maximumSalary: 312_000, extractedMinimumSalary: 100, extractedMaximumSalary: 150, payRate: "HOURLY", salaryCurrency: "USD" };
    expect(projectJobCardDetails({ payload }).salary).toEqual({ minimum: 100, maximum: 150, stated: null, currency: "USD", period: "hour" });
    expect(projectJobCardDetails({ payload: { minimumSalary: 208_000, maximumSalary: 312_000, payRate: "HOURLY" } }).salary)
      .toEqual({ minimum: 208_000, maximum: 312_000, stated: null, currency: null, period: "year" });
    expect(projectJobCardDetails({ payload: { minimumSalary: 100_000 } }).salary?.period).toBeNull();
  });

  it.each<[Record<string, unknown>, Record<string, unknown> | null]>([
    [{ extractedMinimumSalary: 6000, extractedMaximumSalary: 4000, minimumSalary: 48000, maximumSalary: 72000, payRate: "MONTHLY", salaryCurrency: "EUR" },
      { minimum: 4000, maximum: 6000, stated: null, currency: "EUR", period: "month" }],
    [{ extractedMaximumSalary: 750, minimumSalary: 100000, salary: 150000, payRate: "DAILY" },
      { minimum: null, maximum: 750, stated: null, currency: null, period: "day" }],
    [{ extractedMinimumSalary: 1200, payRate: "WEEKLY", salaryCurrency: "GBP" },
      { minimum: 1200, maximum: null, stated: null, currency: "GBP", period: "week" }],
    [{ extractedMinimumSalary: 100000, payRate: "YEARLY" },
      { minimum: 100000, maximum: null, stated: null, currency: null, period: "year" }],
    [{ extractedMinimumSalary: 80, maximumSalary: 200000, payRate: "UNKNOWN" },
      { minimum: 80, maximum: null, stated: null, currency: null, period: null }],
    [{ salary: 96000, payRate: "MONTHLY", salaryCurrency: "CAD" },
      { minimum: null, maximum: null, stated: 96000, currency: "CAD", period: "year" }],
    [{ minimumSalary: 50000, payRate: "UNSPECIFIED", salaryCurrency: "" },
      { minimum: 50000, maximum: null, stated: null, currency: null, period: null }],
    [{ extractedMinimumSalary: 0, extractedMaximumSalary: -10, salary: "100000", minimumSalary: Infinity, maximumSalary: NaN }, null],
    [{ salaryCurrency: "USD", payRate: "YEARLY" }, null],
    [{}, null],
  ])("projects salary units and unknowns without mixing raw and annualized amounts (%j)", (payload, expected) => {
    expect(projectJobSalary(payload)).toEqual(expected);
    expect(projectJobCardDetails({ payload }).salary).toEqual(expected);
  });

  it("preserves company and project context, second-based funding dates and explicit funding currency", () => {
    const result = projectJobCardDetails({ payload: {}, organizationPayload: {
      name: "Ava Labs, Inc.", summary: "Builds Avalanche.", description: "A longer company description.",
      fundingRounds: [{ roundName: "ICO", date: 1631750400, raisedAmount: 230000000, currency: "USD" }, { roundName: "Seed", raisedAmount: 500000 }],
      investors: [{ name: "Investor A" }], projects: [{ id: "a", name: "Avalanche", category: "L1", summary: "Network summary." }, { id: "b", name: "Other project", website: "https://example.com" }],
    }, projectPayload: { id: "a", name: "Avalanche", category: "L1" } });
    expect(result.organization?.fundingRounds).toEqual([
      { name: "ICO", date: "2021-09-16T00:00:00.000Z", amount: 230000000, currency: "USD" },
      { name: "Seed", date: null, amount: 500000, currency: null },
    ]);
    expect(result.organization?.description).toBe("A longer company description.");
    expect(result.project?.name).toBe("Avalanche");
    expect(result.relatedProjects.map(project => project.name)).toEqual(["Other project"]);
    expect(result.organization?.logoUrl).toBeNull();
  });

  it("rejects unsafe URLs and false-like booleans while keeping plain skill and availability information", () => {
    const result = projectJobCardDetails({ payload: {
      paysInCrypto: "false", offersTokenAllocation: true,
      tags: [{ name: "TypeScript" }, { name: "TypeScript" }, "Solidity"],
      availability: [{ requirement: "required", workMode: "remote", placeName: "Europe" }, { requirement: "preferred", minimumUtcOffsetMinutes: 60, maximumUtcOffsetMinutes: 180 }, { requirement: "unknown", rawText: "Anywhere" }],
    }, organizationPayload: { name: "Company", logoUrl: "javascript:alert(1)", website: "https://user:password@example.com", description: '<script>alert(1)</script>Useful <b>company</b> [description](javascript:alert(1))' } });
    expect(result.paysInCrypto).toBe(false);
    expect(result.offersTokenAllocation).toBe(true);
    expect(projectJobCardDetails({ payload: { locationType: "unstated", seniority: "unknown", commitment: "unspecified" } }))
      .toMatchObject({ workMode: null, seniority: null, commitment: null });
    expect(result.organization?.logoUrl).toBeNull();
    expect(result.organization?.website).toBeNull();
    expect(result.organization?.description).not.toMatch(/<\/?script\b|javascript:|<\/?b>/i);
    expect(result.skills).toEqual(["TypeScript", "Solidity"]);
    expect(result.availability).toEqual([{ requirement: "required", label: "Remote · Europe" }, { requirement: "preferred", label: "UTC+1–UTC+3" }]);
  });
});
