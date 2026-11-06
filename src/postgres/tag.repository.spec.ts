import { PostgresService } from "./postgres.service";
import { TagRepository } from "./tag.repository";

describe("TagRepository", () => {
  it("deduplicates fuzzy inputs and maps numeric result fields", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        input: "TypeScript",
        properties: { id: "typescript", name: "TypeScript" },
        score: "2.5",
        jobCount: "7",
      },
    ]);
    const repository = new TagRepository({
      query,
    } as unknown as PostgresService);

    await expect(
      repository.fuzzyMatches(
        ["TypeScript", "typescript", "TypeScript"],
        5,
        true,
      ),
    ).resolves.toEqual([
      {
        id: "typescript",
        name: "TypeScript",
        input: "TypeScript",
        score: 2.5,
        jobCount: 7,
      },
    ]);

    const [, parameters] = query.mock.calls[0];
    expect(parameters).toEqual([["TypeScript", "typescript"], 5, true]);
  });
});
