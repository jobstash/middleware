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
  beforeEach(() => {
    previousOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    embed = jest.fn().mockResolvedValue([[1]]);
    (OpenAIEmbeddings as unknown as jest.Mock).mockImplementation(() => ({
      embedDocuments: embed,
    }));
    repository = {
      pending: jest.fn().mockResolvedValue([input]),
      reusable: jest.fn().mockResolvedValue(new Map()),
      store: jest.fn().mockResolvedValue(true),
      fail: jest.fn().mockResolvedValue(undefined),
      withWorkerLock: jest.fn(async work => work()),
    };
    service = new RecommendationEmbeddingService(
      repository as never,
      { getOrThrow: () => "test-key", get: () => 100 } as never,
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
    repository.pending.mockResolvedValue([
      {
        ...input,
        content: JSON.stringify([
          { source: "description", text: "We are a dynamic team. Apply now." },
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
    repository.pending.mockResolvedValue([input, { ...input, nodeId: "200" }]);
    embed.mockRejectedValue({ status: 429 });
    await service.refresh();
    expect(embed).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledTimes(1);
    embed.mockResolvedValue([[1], [2]]);
    await service.refresh();
    expect(repository.store).toHaveBeenCalledTimes(2);
  });
  it("continues after an individual non-rate-limit failure", async () => {
    repository.pending.mockResolvedValue([input, { ...input, nodeId: "200" }]);
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
    repository.pending.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve([]);
        }),
    );
    const first = service.refresh();
    await service.refresh();
    expect(repository.pending).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
