import { PostgresService } from "./postgres.service";
import { TagRepository } from "./tag.repository";

describe("TagRepository", () => {
  it("counts tags from jobs with one exact Organization or Project employer", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new TagRepository({
      query,
    } as unknown as PostgresService);

    await repository.getUnblockedTags();
    await repository.getPopularTags(20, 100);

    for (const [sql] of query.mock.calls) {
      expect(sql).toContain(
        "num_nonnulls(job.organization_id, job.project_id) = 1",
      );
      expect(sql).not.toContain("FROM job_search_owners owner");
    }
  });
});
