import { RecommendationCache } from "./recommendation-cache";
describe("recommendation work reuse", () => {
  it("coalesces simultaneous reads but keeps account and revision keys separate", async () => {
    const cache = new RecommendationCache<string[]>();
    let complete: (value: string[]) => void = () => {};
    const loader = jest.fn(
      () =>
        new Promise<string[]>(resolve => {
          complete = resolve;
        }),
    );
    const reads = Array.from({ length: 50 }, () =>
      cache.get("alice:revision-1", loader),
    );
    expect(loader).toHaveBeenCalledTimes(1);
    complete(["job-a"]);
    await Promise.all(reads);
    expect(
      await cache.get("alice:revision-1", () => Promise.resolve(["wrong"])),
    ).toEqual(["job-a"]);
    expect(
      await cache.get("bob:revision-1", () => Promise.resolve(["job-b"])),
    ).toEqual(["job-b"]);
    expect(
      await cache.get("alice:revision-2", () => Promise.resolve([])),
    ).toEqual([]);
  });
  it("does not retain a failed computation", async () => {
    const cache = new RecommendationCache<string[]>();
    await expect(
      cache.get("alice", () => Promise.reject(new Error("temporary"))),
    ).rejects.toThrow("temporary");
    expect(
      await cache.get("alice", () => Promise.resolve(["recovered"])),
    ).toEqual(["recovered"]);
  });
});
