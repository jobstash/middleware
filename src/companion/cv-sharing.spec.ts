import { ConfigService } from "@nestjs/config";
import { CvShareService } from "./cv-share.service";
import { cvShareObject } from "./cv-sharing";
import { r2CvObjectStorage } from "./cv-storage";
import { CV_PDF, CvShareInput, deviceInput } from "./device-execution.protocol";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileRepository } from "src/postgres/profile.repository";
import { DeviceExecutionService } from "./device-execution.service";

const payload = (): CvShareInput => ({
  document: {
    filename: "CV.pdf",
    mediaType: CV_PDF,
    contentBase64: Buffer.from("%PDF-1.7\nsynthetic").toString("base64"),
  },
  employment: [
    {
      ref: "profile:123",
      title: "Engineer",
      startDate: "2021",
      endDate: null,
      current: true,
    },
  ],
  consent: { version: 1, grantedAt: "2026-10-20T20:00:00.000Z" },
});

describe("consented companion upload validation", () => {
  it("accepts immutable upload IDs and strictly validates deletion targets", () => {
    const documentId = "00000000-0000-4000-8000-000000000001";
    expect(deviceInput("cv", { ...payload(), documentId }).documentId).toBe(
      documentId,
    );
    expect(deviceInput("cvDelete", { documentId })).toEqual({ documentId });
    for (const value of [
      {},
      { documentId: "../other" },
      { documentId, owner: "1" },
      { documentId, consent: true },
    ])
      expect(() => deviceInput("cvDelete", value)).toThrow();
    expect(() =>
      deviceInput("cv", { ...payload(), documentId: "invalid" }),
    ).toThrow();
  });
  it("accepts zero matched employers while still requiring a bounded list of complete roles", () => {
    expect(
      deviceInput("cv", { ...payload(), employment: [] }).employment,
    ).toEqual([]);
    const { employment, ...withoutEmployment } = payload();
    expect(() => deviceInput("cv", withoutEmployment)).toThrow();
    for (const invalid of [
      null,
      {},
      [undefined],
      [null],
      [{}],
      [{ ...employment[0], title: undefined }],
      Array(51).fill(employment[0]),
    ])
      expect(() =>
        deviceInput("cv", { ...payload(), employment: invalid }),
      ).toThrow();
  });
  it("preserves PDF bytes, and writes a text CV with a .txt extension", () => {
    expect(cvShareObject(deviceInput("cv", payload()).document)).toEqual({
      body: Buffer.from("%PDF-1.7\nsynthetic"),
      filename: "CV.pdf",
      contentType: CV_PDF,
    });
    expect(
      cvShareObject({
        filename: "CV",
        mediaType: "text/plain",
        text: "Engineer\n2021–2024",
      }),
    ).toEqual({
      body: Buffer.from("Engineer\n2021–2024"),
      filename: "CV.txt",
      contentType: "text/plain; charset=utf-8",
    });
  });
  it("rejects noncanonical base64 and mismatching file magic", () => {
    for (const contentBase64 of ["%%%%", "YQ==", "JVBERi0=\n"])
      expect(() =>
        cvShareObject({ filename: "CV.pdf", mediaType: CV_PDF, contentBase64 }),
      ).toThrow();
  });
  it("rejects extra fields, path filenames, unknown reference types and contradictory dates", () => {
    const base = payload();
    for (const value of [
      { ...base, owner: "999" },
      { ...base, document: { ...base.document, filename: "../CV.pdf" } },
      { ...base, employment: [{ ...base.employment[0], ref: "user:1" }] },
      {
        ...base,
        employment: [
          { ...base.employment[0], ref: "profile:9999999999999999999" },
        ],
      },
      {
        ...base,
        employment: [
          {
            ...base.employment[0],
            startDate: "2022",
            endDate: "2021",
            current: false,
          },
        ],
      },
      { ...base, employment: [{ ...base.employment[0], endDate: "2024" }] },
      { ...base, employment: [base.employment[0], base.employment[0]] },
      { ...base, consent: { version: 1, grantedAt: "2026-02-31T00:00:00Z" } },
    ])
      expect(() => deviceInput("cv", value)).toThrow();
  });
  it("fails closed without R2 configuration before performing storage or database writes", async () => {
    const config = new ConfigService({ FE_DOMAIN: "https://jobstash.xyz" });
    expect(r2CvObjectStorage(config)).toBeNull();
    const db = { query: jest.fn(), transaction: jest.fn() };
    const devices = {
      authorize: jest.fn().mockResolvedValue({ id: "1", label: "Candidate" }),
    };
    // Dependency doubles implement only the methods exercised in this failure path.
    const service = new CvShareService(
      db as unknown as PostgresService,
      devices as unknown as DeviceExecutionService,
      {} as ProfileRepository,
      config,
      null,
    );
    await expect(
      service.share({ id: "device", owner: "1" }, payload()),
    ).rejects.toMatchObject({ status: 503 });
    devices.authorize.mockClear();
    await expect(
      service.delete(
        { id: "device", owner: "1" },
        { documentId: "00000000-0000-4000-8000-000000000001" },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(devices.authorize).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
