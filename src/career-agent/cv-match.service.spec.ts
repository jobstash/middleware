import { CvMatchService, requirementCategory } from "./cv-match.service";
describe("CV matching ownership and source evidence", () => {
  const document = { id: "owned", filename: "My CV", status: "ready" };
  const setup = (status = "ready") => {
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes(" AS fingerprint"))
          return [{ fingerprint: [], advanced: true }];
        if (sql.startsWith("SELECT max(updated_at)")) return [];
        if (sql.startsWith("SELECT j.short_uuid AS id")) return [{ id: "job" }];
        if (sql.includes(' AS "createdAt"')) return [{ ...document, status }];
        return [
          {
            shortUUID: "job",
            original:
              "Requirements\nExperience building TypeScript services.\nAbility to lead engineering teams.",
            pairs: [
              {
                requirement: "Experience building TypeScript services.",
                excerpt: "Built TypeScript services at Example.",
                similarity: 0.86,
              },
              {
                requirement: "Ability to lead engineering teams.",
                excerpt: "Unrelated CV text",
                similarity: 0.2,
              },
            ],
          },
        ];
      }),
    };
    const profile = {
      getRecommendedJobs: jest
        .fn()
        .mockResolvedValue({ jobs: [{ job: { shortUUID: "job" } }], total: 1 }),
    };
    return {
      db,
      profile,
      service: new CvMatchService(
        db as never,
        { owner: jest.fn().mockResolvedValue("alice") } as never,
        profile as never,
      ),
    };
  };
  it("rejects foreign document IDs before fetching any jobs or excerpts", async () => {
    const { service, profile, db } = setup();
    await expect(service.matches("alice", "foreign", 1, 10)).rejects.toThrow(
      "CV not found",
    );
    expect(profile.getRecommendedJobs).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it("uses only the selected document and retains exact original requirements and related excerpts", async () => {
    const { service, profile } = setup();
    const result = await service.matches("alice", "owned", 1, 10);
    expect(profile.getRecommendedJobs).toHaveBeenCalledWith(
      "alice",
      10,
      "web",
      1,
      undefined,
      { documentId: "owned" },
      false,
    );
    expect(result.jobs[0].requirements).toEqual([
      {
        text: "Experience building TypeScript services.",
        category: "Technical skills",
        state: "related",
        excerpt: "Built TypeScript services at Example.",
      },
      {
        text: "Ability to lead engineering teams.",
        category: "Leadership",
        state: "gap",
        excerpt: null,
      },
    ]);
  });
  it.each(["processing", "failed", "unavailable"])(
    "does not substitute profile ranking when the CV is %s",
    async status => {
      const { service, profile } = setup(status);
      expect((await service.matches("alice", "owned", 1, 10)).jobs).toEqual([]);
      expect(profile.getRecommendedJobs).not.toHaveBeenCalled();
    },
  );
  it("reuses paid ranking but checks live job eligibility on every read", async () => {
    const { service, profile, db } = setup();
    await service.matches("alice", "owned", 1, 10);
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql =>
      sql.startsWith("SELECT j.short_uuid AS id") ? [] : original(sql),
    );
    expect((await service.matches("alice", "owned", 1, 10)).jobs).toEqual([]);
    expect(profile.getRecommendedJobs).toHaveBeenCalledTimes(1);
  });
  it("rechecks allocation after a paid account expires and for every free read", async () => {
    const { service, profile, db } = setup();
    await service.matches("alice", "owned", 1, 10);
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql =>
      sql.includes(" AS fingerprint")
        ? [{ fingerprint: [], advanced: false }]
        : original(sql),
    );
    await service.matches("alice", "owned", 1, 10);
    await service.matches("alice", "owned", 1, 10);
    expect(profile.getRecommendedJobs).toHaveBeenCalledTimes(3);
  });
  it("invalidates paid results after a dismissal or application change", async () => {
    const { service, profile, db } = setup();
    await service.matches("alice", "owned", 1, 10);
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql =>
      sql.includes(" AS fingerprint")
        ? [{ fingerprint: ["dismissal"], advanced: true }]
        : original(sql),
    );
    await service.matches("alice", "owned", 1, 10);
    expect(profile.getRecommendedJobs).toHaveBeenCalledTimes(2);
  });
  it("groups qualifications and domain requirements without inventing skills", () => {
    expect(requirementCategory("Bachelor degree in computer science")).toBe(
      "Education",
    );
    expect(requirementCategory("Knowledge of Ethereum protocols")).toBe(
      "Domain",
    );
  });
});
