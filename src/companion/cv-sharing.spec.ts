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
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
