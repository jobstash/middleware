import { matchingCatalogue, matchingJobs } from "./device-matching";

describe("production companion matching SQL", () => {
  it("selects the latest fourteen days by publication, newest first", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: "node:1",
        title: "Engineer",
        company: "Org",
        publishedTimestamp: "1791504000000",
        salaryPayload: {},
      },
    ]);
    const result = await matchingCatalogue({ query });
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("interval '14 days'");
    expect(sql).toContain("ORDER BY j.published_timestamp DESC");
    expect(sql).toContain("WHERE j.online AND NOT j.blocked");
    expect(sql).not.toContain("first_seen");
    expect(result.jobs[0]).toMatchObject({
      id: "node:1",
      publishedAt: "2026-10-09T00:00:00.000Z",
    });
  });

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
});
