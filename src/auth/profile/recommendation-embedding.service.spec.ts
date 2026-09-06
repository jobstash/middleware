import { OpenAIEmbeddings } from "@langchain/openai";
import { RecommendationEmbeddingService } from "./recommendation-embedding.service";
import { recommendationSentences } from "./recommendation-sentences";

jest.mock("@langchain/openai", () => ({ OpenAIEmbeddings: jest.fn() }));

describe("sentence embedding refresh", () => {
  const content = JSON.stringify([
    {
      source: "requirements",
      text: "Build Rust services. Operate production databases.",
    },
  ]);
  const input = { kind: "job", nodeId: "100", hash: "source-hash", content };
  let previousOwner: string | undefined;
  let embed: jest.Mock;
  let repository: {
    pending: jest.Mock;
    reusable: jest.Mock;
    store: jest.Mock;
    fail: jest.Mock;
    withWorkerLock: jest.Mock;
  };
  let service: RecommendationEmbeddingService;
  let concurrency: number;
  beforeEach(() => {
    previousOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    concurrency = 5;
    embed = jest.fn().mockResolvedValue([[1]]);
    (OpenAIEmbeddings as unknown as jest.Mock).mockImplementation(() => ({
      embedDocuments: embed,
    }));
    repository = {
      pending: jest.fn().mockResolvedValue([]).mockResolvedValueOnce([input]),
      reusable: jest.fn().mockResolvedValue(new Map()),
      store: jest.fn().mockResolvedValue(true),
      fail: jest.fn().mockResolvedValue(undefined),
      withWorkerLock: jest.fn(async work => work()),
    };
    service = new RecommendationEmbeddingService(
      repository as never,
      {
        getOrThrow: () => "test-key",
        get: (key: string) => (key.endsWith("CONCURRENCY") ? concurrency : 100),
      } as never,
    );
  });
  afterEach(() => {
    if (previousOwner === undefined)
      delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
    else process.env.MIDDLEWARE_SCHEDULE_OWNER = previousOwner;
    jest.clearAllMocks();
  });
  it("reuses existing vectors and sends only new individual sentences", async () => {
    const sentences = recommendationSentences(content);
    repository.reusable.mockResolvedValue(new Map([[sentences[0].hash, [2]]]));
    await service.refresh();
    expect(embed).toHaveBeenCalledWith(["Operate production databases."]);
    expect(repository.store).toHaveBeenCalledWith(input, [
      { ...sentences[0], embedding: [2] },
      { ...sentences[1], embedding: [1] },
    ]);
  });
  it("makes no model request for generic-only content and marks it processed", async () => {
    repository.pending
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([
        {
          ...input,
          content: JSON.stringify([
            {
              source: "description",
              text: "We are a dynamic team. Apply now.",
            },
          ]),
        },
      ]);
    await service.refresh();
    expect(embed).not.toHaveBeenCalled();
    expect(repository.store).toHaveBeenCalledWith(expect.anything(), []);
  });
  it("does not store partial embedding results", async () => {
    await service.refresh();
    expect(repository.fail).toHaveBeenCalledWith(input);
    expect(repository.store).not.toHaveBeenCalled();
  });
  it("stops launching calls after a rate limit and retries on a later pass", async () => {
    concurrency = 1;
    repository.pending
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([input, { ...input, nodeId: "200" }]);
    embed.mockRejectedValue({ status: 429 });
    await service.refresh();
    expect(embed).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledTimes(1);
    repository.pending.mockResolvedValueOnce([
      input,
      { ...input, nodeId: "200" },
    ]);
    embed.mockResolvedValue([[1], [2]]);
    await service.refresh();
    expect(repository.store).toHaveBeenCalledTimes(2);
  });
  it("continues after an individual non-rate-limit failure", async () => {
    repository.pending
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([input, { ...input, nodeId: "200" }]);
    embed
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue([[1], [2]]);
    await service.refresh();
    expect(repository.store).toHaveBeenCalledTimes(1);
    expect(repository.store.mock.calls[0][0].nodeId).toBe("200");
  });
  it("uses the existing scheduler owner and never overlaps local runs", async () => {
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "0";
    await service.refresh();
    expect(repository.pending).not.toHaveBeenCalled();
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    let release!: () => void;
    repository.pending.mockReset().mockImplementation(
      () =>
        new Promise(resolve => {
          release = (): void => resolve([]);
        }),
    );
    const first = service.refresh();
    await service.refresh();
    expect(repository.pending).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
  it("drains consecutive pages immediately until no work remains", async () => {
    embed.mockResolvedValue([[1], [2]]);
    repository.pending.mockResolvedValueOnce([{ ...input, nodeId: "200" }]);
    await service.refresh();
    expect(
      repository.store.mock.calls.map(([document]) => document.nodeId),
    ).toEqual(["100", "200"]);
    expect(repository.pending).toHaveBeenCalledTimes(3);
  });
  it("bounds document concurrency and stops dispatch after an authentication error", async () => {
    concurrency = 2;
    repository.pending
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, index) => ({
          ...input,
          nodeId: String(index),
        })),
      );
    const releases: Array<(value: number[][]) => void> = [];
    let rejectFirst!: (error: unknown) => void;
    embed.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          releases.push(resolve);
          rejectFirst ??= reject;
        }),
    );
    const refresh = service.refresh();
    await new Promise(resolve => setImmediate(resolve));
    expect(embed).toHaveBeenCalledTimes(2);
    rejectFirst({ status: 401 });
    await new Promise(resolve => setImmediate(resolve));
    expect(repository.fail).toHaveBeenCalledTimes(1);
    // The other in-flight document still finishes successfully.
    releases[1]([[1], [2]]);
    await refresh;
    expect(embed).toHaveBeenCalledTimes(2);
    expect(repository.store).toHaveBeenCalledTimes(1);
    expect(repository.pending).toHaveBeenCalledTimes(1);
    expect(OpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ maxConcurrency: 2 }),
    );
  });
  it("continues discovery after a failed page, but does not spin on stale inputs", async () => {
    repository.pending.mockResolvedValueOnce([{ ...input, nodeId: "200" }]);
    embed
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue([[1], [2]]);
    repository.store.mockResolvedValue(false);
    await service.refresh();
    expect(repository.fail).toHaveBeenCalledTimes(1);
    expect(repository.pending).toHaveBeenCalledTimes(2);
  });
  it("waits for in-flight writes before releasing the lock after a database failure", async () => {
    let release!: () => void;
    let unlocked = false;
    repository.pending
      .mockReset()
      .mockResolvedValue([])
      .mockResolvedValueOnce([input, { ...input, nodeId: "200" }]);
    embed.mockResolvedValue([[1], [2]]);
    repository.store
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = (): void => resolve(true);
          }),
      );
    repository.fail.mockRejectedValue(new Error("database unavailable"));
    repository.withWorkerLock.mockImplementation(async work => {
      try {
        await work();
      } finally {
        unlocked = true;
      }
    });
    const refresh = service.refresh();
    await new Promise(resolve => setImmediate(resolve));
    expect(unlocked).toBe(false);
    release();
    await refresh;
    expect(unlocked).toBe(true);
    expect(repository.pending).toHaveBeenCalledTimes(1);
  });
  it("starts discovery on application startup without blocking startup", () => {
    const refresh = jest.spyOn(service, "refresh").mockResolvedValue();
    expect(service.onApplicationBootstrap()).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
