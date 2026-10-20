import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { assertCvEmploymentRefs, replaceCvEmployment } from "./cv-sharing";
import {
  cvDatesOrdered,
  cvEmploymentKey,
  CvShareInput,
  deviceInput,
} from "./device-execution.protocol";
import { employerSearch } from "./employer-search";

const role = {
  ref: "profile:12",
  title: "Senior Engineer",
  startDate: "2021-03",
  endDate: "2024-01",
  current: false,
};
const share = (
  changed: Record<string, unknown> = {},
): Record<string, unknown> => ({
  document: {
    filename: "Jane Doe CV.pdf",
    mediaType: "application/pdf",
    contentBase64: Buffer.from("%PDF-1.7 synthetic").toString("base64"),
  },
  employment: [role],
  consent: { version: 1, grantedAt: "2026-10-20T19:00:00.000Z" },
  ...changed,
});

describe("employer_search platform schema", () => {
  it("accepts 1-20 named queries with an optional website and nothing else", () => {
    for (const queries of [
      [{ name: "Flow Traders", website: "flowtraders.com" }],
      [
        {
          name: "Flow Traders",
          website: "https://www.flowtraders.com/careers",
        },
      ],
      Array.from({ length: 20 }, (_, index) => ({ name: `Employer ${index}` })),
    ]) {
      const value = { operation: "employer_search", args: { queries } };
      expect(deviceInput("platform", value)).toEqual(value);
    }
    for (const queries of [
      [],
      Array.from({ length: 21 }, () => ({ name: "Employer" })),
      [{}],
      [{ name: "" }],
      [{ name: "   " }],
      [{ name: "x".repeat(201) }],
      [{ name: "Flow\nTraders" }],
      [{ name: "Flow", website: "" }],
      [{ name: "Flow", website: " " }],
      [{ name: "Flow", website: "x".repeat(301) }],
      [{ name: "Flow", candidate: "Private CV" }],
      [{ name: 7 }],
    ])
      expect(() =>
        deviceInput("platform", {
          operation: "employer_search",
          args: { queries },
        }),
      ).toThrow(BadRequestException);
    expect(() =>
      deviceInput("platform", {
        operation: "employer_search",
        args: { queries: [{ name: "Flow" }], cv: "text" },
      }),
    ).toThrow();
  });

  it("returns one result per query in order with trimmed names", async () => {
    const calls: unknown[][] = [];
    const db = {
      query: async (
        _sql: string,
        parameters: unknown[] = [],
      ): Promise<unknown[]> => {
        calls.push(parameters);
        return parameters[0] === "Acme" ? [{ ref: "profile:1" }] : [];
      },
    };
    expect(
      await employerSearch(db, [
        { name: " Acme ", website: " acme.example " },
        { name: "Unknown" },
      ]),
    ).toEqual({
      results: [
        { name: "Acme", candidates: [{ ref: "profile:1" }] },
        { name: "Unknown", candidates: [] },
      ],
    });
    expect(calls).toEqual([
      ["Acme", "acme.example"],
      ["Unknown", null],
    ]);
  });
});

describe("CV share schema", () => {
  it("accepts original documents, text CVs and bounded employment", () => {
    expect(deviceInput("cv", share())).toEqual(share());
    expect(
      deviceInput(
        "cv",
        share({
          document: {
            filename: "CV.txt",
            mediaType: "text/plain",
            text: "Jane Doe\nEngineer",
          },
        }),
      ),
    ).toBeTruthy();
    expect(deviceInput("cv", share({ employment: [] }))).toBeTruthy();
    expect(
      deviceInput(
        "cv",
        share({
          employment: [
            { ...role, ref: "organization:9", endDate: null, current: true },
            {
              ...role,
              ref: "project:9223372036854775807",
              startDate: "2021",
              endDate: "2021-03",
            },
            { ...role, title: "Staff Engineer" },
          ],
        }),
      ),
    ).toBeTruthy();
    expect(
      deviceInput(
        "cv",
        share({
          employment: Array.from({ length: 50 }, (_, index) => ({
            ...role,
            title: `Role ${index}`,
          })),
        }),
      ),
    ).toBeTruthy();
  });

  it("rejects malformed documents, consent, references and dates", () => {
    const document = share().document as Record<string, unknown>;
    for (const value of [
      share({ document: { ...document, mediaType: "image/png" } }),
      share({ document: { ...document, filename: "../CV.pdf" } }),
      share({ document: { ...document, filename: " " } }),
      share({ document: { ...document, contentBase64: "" } }),
      share({ document: { ...document, text: "both" } }),
      share({
        document: { filename: "CV.txt", mediaType: "text/plain", text: "" },
      }),
      share({
        document: {
          filename: "CV.txt",
          mediaType: "text/plain",
          text: "x".repeat(100001),
        },
      }),
      share({
        employment: Array.from({ length: 51 }, (_, index) => ({
          ...role,
          title: `Role ${index}`,
        })),
      }),
      share({ employment: [role, role] }),
      share({ consent: { version: 2, grantedAt: "2026-10-20T19:00:00.000Z" } }),
      share({ consent: { version: 1, grantedAt: "2026-02-30T19:00:00.000Z" } }),
      share({ consent: { version: 1, grantedAt: "yesterday" } }),
      share({ consent: { version: 1 } }),
      share({ extra: true }),
      ...[
        { ref: "profile:0" },
        { ref: "profile:01" },
        { ref: "user:1" },
        { ref: "profile:1\n" },
        { ref: "profile:9223372036854775808" },
        { title: "" },
        { title: "   " },
        { title: "x".repeat(201) },
        { title: "Lead\nEngineer" },
        { startDate: "2021-13" },
        { startDate: "21-03" },
        { startDate: "2021-3" },
        { startDate: "2021-03-01" },
        { endDate: "2020-12" },
        { startDate: "2022", endDate: "2021-12" },
        { current: true },
        { current: "false" },
        { documentId: "foreign" },
      ].map(changed => share({ employment: [{ ...role, ...changed }] })),
    ])
      expect(() => deviceInput("cv", value)).toThrow(BadRequestException);
  });

  it("orders partial dates on their common precision and keys distinct roles", () => {
    expect(cvDatesOrdered("2021", "2021-03")).toBe(true);
    expect(cvDatesOrdered("2021-05", "2021")).toBe(true);
    expect(cvDatesOrdered("2021-05", "2021-04")).toBe(false);
    expect(cvDatesOrdered("2021-05", null)).toBe(true);
    expect(cvEmploymentKey(role)).toBe(
      createHash("sha256")
        .update("Senior Engineer\n2021-03\n2024-01\nfalse")
        .digest("hex"),
    );
    expect(cvEmploymentKey({ ...role, endDate: null, current: true })).toBe(
      createHash("sha256")
        .update("Senior Engineer\n2021-03\nnull\ntrue")
        .digest("hex"),
    );
    expect(cvEmploymentKey({ ...role, title: "Staff Engineer" })).not.toBe(
      cvEmploymentKey(role),
    );
  });
});

describe("CV employment references", () => {
  it("resolves every distinct ref by label and rejects missing or banned nodes", async () => {
    const queries: unknown[][] = [];
    const db = (
      found: number,
    ): {
      query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>;
    } => ({
      query: async (
        _sql: string,
        parameters: unknown[] = [],
      ): Promise<unknown[]> => {
        queries.push(parameters);
        return Array.from({ length: found }, () => ({ id: 1 }));
      },
    });
    const employment = [
      role,
      { ...role, title: "Staff Engineer" },
      { ...role, ref: "organization:7" },
      { ...role, ref: "project:8" },
    ];
    await expect(
      assertCvEmploymentRefs(db(3), employment),
    ).resolves.toBeUndefined();
    expect(queries[0]).toEqual([
      ["12", "7", "8"],
      ["EntityProfile", "Organization", "Project"],
    ]);
    await expect(assertCvEmploymentRefs(db(2), employment)).rejects.toThrow(
      BadRequestException,
    );
    await expect(assertCvEmploymentRefs(db(0), [])).resolves.toBeUndefined();
    expect(queries).toHaveLength(2);
  });

  it("replaces the owner's edges with one keyed edge per role", async () => {
    const statements: Array<[string, unknown[]]> = [];
    const db = {
      query: async (
        sql: string,
        parameters: unknown[] = [],
      ): Promise<unknown[]> => {
        statements.push([sql, parameters]);
        return [];
      },
    };
    const input = share({
      employment: [
        role,
        { ...role, ref: "organization:7", endDate: null, current: true },
      ],
    }) as unknown as CvShareInput;
    await replaceCvEmployment(
      db,
      "42",
      input,
      "document-id",
      "2026-10-20T20:00:00.000Z",
    );
    expect(statements[0]).toEqual([
      expect.stringContaining("DELETE FROM graph_relationships"),
      ["42", "CV_EMPLOYMENT"],
    ]);
    expect(statements[1][1].slice(0, 4)).toEqual([
      "42",
      "CV_EMPLOYMENT",
      ["12", "7"],
      input.employment.map(cvEmploymentKey),
    ]);
    const provenance = {
      documentId: "document-id",
      source: "companion_cv",
      consentVersion: 1,
      sharedAt: "2026-10-20T20:00:00.000Z",
    };
    expect(
      (statements[1][1][4] as string[]).map(value => JSON.parse(value)),
    ).toEqual([
      {
        title: "Senior Engineer",
        startDate: "2021-03",
        endDate: "2024-01",
        current: false,
        ...provenance,
      },
      {
        title: "Senior Engineer",
        startDate: "2021-03",
        endDate: null,
        current: true,
        ...provenance,
      },
    ]);
    statements.length = 0;
    await replaceCvEmployment(
      db,
      "42",
      share({ employment: [] }) as unknown as CvShareInput,
      "document-id",
      "2026-10-20T20:00:00.000Z",
    );
    expect(statements).toHaveLength(1);
  });
});
