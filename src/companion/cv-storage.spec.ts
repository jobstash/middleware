import { ConfigService } from "@nestjs/config";
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { r2CvObjectStorage } from "./cv-storage";

jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return { ...actual, S3Client: jest.fn() };
});

describe("CV object storage exact targets", () => {
  const send = jest.fn();
  const config = new ConfigService({
    R2_ENDPOINT: "https://storage.invalid",
    R2_ACCESS_KEY_ID: "synthetic",
    R2_SECRET_ACCESS_KEY: "synthetic",
    R2_BUCKET_NAME: "synthetic-resumes",
  });
  const preconditionFailed = (): S3ServiceException =>
    new S3ServiceException({
      name: "PreconditionFailed",
      $fault: "client",
      $metadata: { httpStatusCode: 412 },
    });
  beforeEach(() => {
    send.mockReset();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });

  it("exhausts every page without including a neighboring prefix", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [
          { Key: "target/one.txt" },
          { Key: "target-other/private.txt" },
        ],
        IsTruncated: true,
        NextContinuationToken: "next",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "target/two.pdf" }],
        IsTruncated: false,
      });
    const storage = r2CvObjectStorage(config)!;
    await expect(storage.list("target/")).resolves.toEqual([
      "target/one.txt",
      "target/two.pdf",
    ]);
    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "synthetic-resumes",
      Prefix: "target/",
      ContinuationToken: undefined,
    });
    expect(send.mock.calls[1][0].input.ContinuationToken).toBe("next");
  });

  it("fails closed when storage cannot establish complete absence", async () => {
    send.mockResolvedValueOnce({ IsTruncated: true });
    await expect(r2CvObjectStorage(config)!.list("target/")).rejects.toThrow(
      "Incomplete CV object listing",
    );
    send.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(r2CvObjectStorage(config)!.list("target/")).rejects.toThrow(
      "storage unavailable",
    );
  });

  it("erases bytes with a permanent same-key fence and propagates a failed fence write", async () => {
    send.mockRejectedValueOnce(new Error("fence response lost"));
    await expect(
      r2CvObjectStorage(config)!.delete("target/CV.txt"),
    ).rejects.toThrow("fence response lost");
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "synthetic-resumes",
      Key: "target/CV.txt",
      Body: Buffer.alloc(0),
      ContentType: "application/octet-stream",
      CacheControl: "private, no-store",
      Metadata: { "companion-cv-state": "deleted" },
    });
  });
  it("uses create-only writes carrying the immutable request fingerprint", async () => {
    send.mockResolvedValueOnce({});
    const body = Buffer.from("synthetic CV");
    await expect(
      r2CvObjectStorage(config)!.put(
        "target/CV.txt",
        body,
        "text/plain",
        "request-hash",
      ),
    ).resolves.toBe(true);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "synthetic-resumes",
      Key: "target/CV.txt",
      Body: body,
      ContentType: "text/plain",
      CacheControl: "private, no-store",
      IfNoneMatch: "*",
      Metadata: {
        "companion-cv-state": "document",
        "companion-cv-request": "request-hash",
      },
    });
  });
  it("accepts a lost-response retry only after HEAD identifies the same document", async () => {
    send.mockRejectedValueOnce(preconditionFailed()).mockResolvedValueOnce({
      Metadata: {
        "companion-cv-state": "document",
        "companion-cv-request": "request-hash",
      },
      ContentLength: 2,
    });
    await expect(
      r2CvObjectStorage(config)!.put(
        "target/CV.txt",
        Buffer.from("CV"),
        "text/plain",
        "request-hash",
      ),
    ).resolves.toBe(true);
    expect(send.mock.calls[1][0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: "synthetic-resumes",
      Key: "target/CV.txt",
    });
  });
  it.each([
    { Metadata: {}, ContentLength: 2 },
    {
      Metadata: {
        "companion-cv-state": "document",
        "companion-cv-request": "different",
      },
      ContentLength: 2,
    },
    {
      Metadata: {
        "companion-cv-state": "document",
        "companion-cv-request": "request-hash",
      },
      ContentLength: 3,
    },
  ])(
    "rejects a conditional conflict with mismatching stored evidence: %j",
    async existing => {
      send
        .mockRejectedValueOnce(preconditionFailed())
        .mockResolvedValueOnce(existing);
      await expect(
        r2CvObjectStorage(config)!.put(
          "target/CV.txt",
          Buffer.from("CV"),
          "text/plain",
          "request-hash",
        ),
      ).rejects.toThrow("Existing CV object does not match");
    },
  );
  it("does not turn an unavailable HEAD into upload success", async () => {
    send
      .mockRejectedValueOnce(preconditionFailed())
      .mockRejectedValueOnce(new Error("HEAD unavailable"));
    await expect(
      r2CvObjectStorage(config)!.put(
        "target/CV.txt",
        Buffer.from("CV"),
        "text/plain",
        "request-hash",
      ),
    ).rejects.toThrow("HEAD unavailable");
  });
  it("fences a PUT that commits after deletion, even when it began against an absent key", async () => {
    let started!: () => void, release!: () => void;
    const inFlight = new Promise<void>(resolve => {
      started = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let stored: { body: Buffer; metadata: Record<string, string> } | undefined;
    send.mockImplementation(
      async (command: PutObjectCommand | HeadObjectCommand) => {
        if (command instanceof HeadObjectCommand)
          return {
            Metadata: stored?.metadata,
            ContentLength: stored?.body.length,
          };
        if (command.input.IfNoneMatch === "*") {
          started();
          await gate;
          if (stored) throw preconditionFailed();
        }
        if (!Buffer.isBuffer(command.input.Body))
          throw new Error("Expected byte body");
        stored = {
          body: command.input.Body,
          metadata: command.input.Metadata ?? {},
        };
        return {};
      },
    );
    const storage = r2CvObjectStorage(config)!;
    const latePut = storage.put(
      "target/CV.txt",
      Buffer.from("private CV"),
      "text/plain",
      "request-hash",
    );
    await inFlight;
    try {
      await storage.delete("target/CV.txt");
      expect(stored).toEqual({
        body: Buffer.alloc(0),
        metadata: { "companion-cv-state": "deleted" },
      });
    } finally {
      release();
    }
    await expect(latePut).resolves.toBe(false);
    expect(stored).toEqual({
      body: Buffer.alloc(0),
      metadata: { "companion-cv-state": "deleted" },
    });
  });
});
