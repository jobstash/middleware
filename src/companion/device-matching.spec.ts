import { matchingCatalogue, matchingJobs } from "./device-matching";

describe("production companion matching SQL", () => {

  it("retains a full oversized first original and reports the remaining batch", async () => {
    const ad = "Original advertisement\n".repeat(4000);
    const query = jest.fn().mockResolvedValue([
      {
        id: "node:1",
        title: "Engineer",
        company: "Org",
        salaryPayload: {},
        rawLocations: ["Paris or remote in France"],
        funding: [],
        projects: [],
        ad,
      },
      {
        id: "node:2",
        title: "Designer",
        company: "Org",
        salaryPayload: {},
        funding: [],
        projects: [],
        ad: "Second original",
      },
    ]);
    const result = await matchingJobs({ query }, [
      "node:1",
      "node:2",
      "node:3",
    ]);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].ad).toBe(ad);
    expect(result.jobs[0].locationEvidence).toContain(
      "Raw advertised role location: Paris or remote in France",
    );
    expect(result.remainingIds).toEqual(["node:2"]);
    expect(result.unavailableIds).toEqual(["node:3"]);
    expect(query.mock.calls[0][0]).toContain("HAS_STRUCTURED_JOBPOST");
    expect(query.mock.calls[0][0]).not.toContain("left(original");
    expect(query.mock.calls[0][1]).toEqual([["node:1", "node:2", "node:3"]]);
  });

  const favicon = "https://www.google.com/s2/favicons?domain=www.sunday.ai&sz=64";
  it.each([
    ["https://cdn.example.test/logo.png", null, "https://cdn.example.test/logo.png"],
    ["https://cdn.example.test/logo.png", "https://www.sunday.ai", "https://cdn.example.test/logo.png"],
    ["http://cdn.example.test/logo.png", null, null],
    ["javascript:alert(1)", null, null],
    ["https://user:secret@cdn.example.test/logo.png", null, null],
    [null, null, null],
    [null, "https://www.sunday.ai/about", favicon],
    [null, "www.sunday.ai", favicon],
    ["http://cdn.example.test/logo.png", "www.sunday.ai", favicon],
    [null, "not a website", null],
  ])("resolves logo %s with website %s like the public jobs API", async (logoUrl, companyWebsite, expected) => {
    const row = { id: "node:1", title: "Engineer", company: "Org", logoUrl, companyWebsite, publishedTimestamp: 1700000000000,
      applyUrl: null, salaryPayload: {}, city: null, location: null, workMode: null, seniority: null,
      commitment: null, classification: null, funding: [], projects: [], ad: null };
    const catalogue = await matchingCatalogue({ query: jest.fn().mockResolvedValue([{ ...row, total: "1" }]) },
      { publicationRange: "all", since: null, until: "2026-10-20T00:00:00.000Z" });
    expect(catalogue.jobs[0]).toMatchObject({ id: "node:1", logoUrl: expected });
    const batch = await matchingJobs({ query: jest.fn().mockResolvedValue([row]) }, ["node:1"]);
    expect(batch.jobs[0].company.logoUrl).toBe(expected);
  });
});
