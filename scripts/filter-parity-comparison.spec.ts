import {
  boundedMutableCollectionDrift,
  boundedMutableSortDrift,
  boundedFixedCollectionDrift,
  canonicalize,
  compatibleSampledContracts,
  JsonValue,
  legacyJobPageEquivalent,
  longRunningEmptySuccessFallback,
  matchingItemsSemanticallyEqual,
  semanticHash,
  truncatedProductionCollection,
} from "./filter-parity-comparison";

describe("filter parity semantic comparison", () => {
  it.each([
    "aliases",
    "audits",
    "chains",
    "ecosystems",
    "fundingRounds",
    "hacks",
    "investors",
    "jobs",
    "projects",
    "tags",
  ])("treats %s as an unordered relation", relation => {
    const left = {
      [relation]: [
        { id: "b", value: 2 },
        { id: "a", value: 1 },
      ],
    };
    const right = {
      [relation]: [
        { value: 1, id: "a" },
        { value: 2, id: "b" },
      ],
    };

    expect(semanticHash(left)).toBe(semanticHash(right));
  });

  it("preserves order for the endpoint collection", () => {
    const first = { data: [{ id: "a" }, { id: "b" }] };
    const second = { data: [{ id: "b" }, { id: "a" }] };

    expect(semanticHash(first)).not.toBe(semanticHash(second));
  });

  it("preserves order for content arrays", () => {
    const first = { requirements: ["first", "second"] };
    const second = { requirements: ["second", "first"] };

    expect(semanticHash(first)).not.toBe(semanticHash(second));
  });

  it("sorts scalar relation arrays and object keys deterministically", () => {
    expect(
      canonicalize({ ecosystems: ["Solana", "Ethereum"], z: 1, a: 2 }),
    ).toEqual({ a: 2, ecosystems: ["Ethereum", "Solana"], z: 1 });
  });

  it("accepts different job IDs only when access streams and sort keys match", () => {
    const production = [
      job("protected-a", "protected", 90),
      job("public-a", "public", 100),
      job("public-b", "public", 100),
    ];
    const local = [
      job("public-c", "public", 100),
      job("protected-a", "protected", 90),
      job("public-d", "public", 100),
    ];

    expect(legacyJobPageEquivalent(production, local)).toBe(true);
    expect(
      legacyJobPageEquivalent(production, [
        job("public-c", "public", 101),
        job("protected-a", "protected", 90),
        job("public-d", "public", 100),
      ]),
    ).toBe(false);
  });

  it("accepts bounded protected-job jitter at a page boundary", () => {
    const production = [
      job("public-a", "public", 100),
      job("protected-a", "protected", 90),
      job("public-b", "public", 100),
      job("protected-b", "protected", 80),
      job("public-c", "public", 100),
    ];
    const local = [
      job("public-d", "public", 100),
      job("public-e", "public", 100),
      job("protected-c", "protected", 90),
      job("public-f", "public", 100),
      job("public-g", "public", 100),
    ];

    expect(legacyJobPageEquivalent(production, local)).toBe(true);
    expect(
      legacyJobPageEquivalent(production, [
        job("public-d", "public", 100),
        job("public-e", "public", 100),
        job("protected-c", "protected", 91),
        job("public-f", "public", 100),
        job("public-g", "public", 100),
      ]),
    ).toBe(false);
  });

  it("uses legacy zero defaults for missing job sort metrics", () => {
    const production = [job("production", "public", 100)];
    const local = [job("local", "public", 200)];

    expect(legacyJobPageEquivalent(production, local, "monthlyFees")).toBe(
      true,
    );
    expect(legacyJobPageEquivalent(production, local, "salary")).toBe(true);
    expect(legacyJobPageEquivalent(production, local, "publicationDate")).toBe(
      false,
    );
  });

  it("compares every overlapping identity after relation canonicalization", () => {
    const production = [
      { id: "shared", tags: [{ id: "b" }, { id: "a" }] },
      { id: "production-only" },
    ];
    const local = [
      { tags: [{ id: "a" }, { id: "b" }], id: "shared" },
      { id: "local-only" },
    ];

    expect(matchingItemsSemanticallyEqual(production, local, "id")).toEqual({
      equal: true,
      matched: 1,
    });
  });

  it("can isolate mutable nested relations without hiding top-level drift", () => {
    const production = [
      { id: "shared", name: "Project", jobs: [{ id: "new-job" }] },
    ];
    const local = [
      { id: "shared", name: "Project", jobs: [{ id: "old-job" }] },
    ];

    expect(matchingItemsSemanticallyEqual(production, local, "id").equal).toBe(
      false,
    );
    expect(
      matchingItemsSemanticallyEqual(production, local, "id", ["jobs"]),
    ).toEqual({ equal: true, matched: 1 });
    expect(
      matchingItemsSemanticallyEqual(
        production,
        [{ id: "shared", name: "Renamed", jobs: [] }],
        "id",
        ["jobs"],
      ).equal,
    ).toBe(false);
  });

  it("compares exact collection items independently from pagination metadata", () => {
    const production = [{ id: "shared", tags: [{ id: "b" }, { id: "a" }] }];
    const local = [{ tags: [{ id: "a" }, { id: "b" }], id: "shared" }];

    expect(matchingItemsSemanticallyEqual(production, local, "id")).toEqual({
      equal: true,
      matched: 1,
    });
    expect(semanticHash({ page: 1, total: 20, data: production })).not.toBe(
      semanticHash({ page: 1, total: 21, data: local }),
    );
  });

  it("accepts only bounded drift between full, highly overlapping pages", () => {
    const baseline = {
      productionTotal: 2598,
      localTotal: 2620,
      productionItems: 20,
      localItems: 20,
      requestedLimit: 20,
      matchedIdentities: 18,
    };

    expect(boundedMutableCollectionDrift(baseline)).toBe(true);
    expect(
      boundedMutableCollectionDrift({
        ...baseline,
        matchedIdentities: 17,
      }),
    ).toBe(false);
    expect(
      boundedMutableCollectionDrift({
        ...baseline,
        matchedIdentities: 0,
        sortSignaturesMatch: true,
      }),
    ).toBe(true);
    expect(
      boundedMutableCollectionDrift({
        ...baseline,
        productionItems: 19,
      }),
    ).toBe(false);
    expect(
      boundedMutableCollectionDrift({
        ...baseline,
        localTotal: 2700,
      }),
    ).toBe(false);
  });

  it("accepts small complete and boundary drift without masking filter gaps", () => {
    expect(
      boundedMutableCollectionDrift({
        productionTotal: 4,
        localTotal: 3,
        productionItems: 4,
        localItems: 3,
        requestedLimit: 20,
        matchedIdentities: 3,
      }),
    ).toBe(true);
    expect(
      boundedMutableCollectionDrift({
        productionTotal: 30,
        localTotal: 27,
        productionItems: 20,
        localItems: 20,
        requestedLimit: 20,
        matchedIdentities: 17,
      }),
    ).toBe(true);
    expect(
      boundedMutableCollectionDrift({
        productionTotal: 197,
        localTotal: 215,
        productionItems: 20,
        localItems: 20,
        requestedLimit: 20,
        matchedIdentities: 19,
      }),
    ).toBe(false);
  });

  it("accepts bounded total drift when legacy pages are otherwise exact", () => {
    expect(
      boundedMutableCollectionDrift({
        productionTotal: 11_585,
        localTotal: 11_433,
        productionItems: 101,
        localItems: 101,
        requestedLimit: 100,
        matchedIdentities: 101,
      }),
    ).toBe(true);
    expect(
      boundedMutableCollectionDrift({
        productionTotal: 11_585,
        localTotal: 11_433,
        productionItems: 0,
        localItems: 0,
        requestedLimit: 1,
        matchedIdentities: 0,
      }),
    ).toBe(true);
  });

  it("bounds equal-total page drift for explicitly mutable sort metrics", () => {
    const baseline = {
      productionTotal: 2_965,
      localTotal: 2_965,
      productionItems: 20,
      localItems: 20,
      requestedLimit: 20,
      matchedIdentities: 9,
    };
    expect(boundedMutableSortDrift(baseline)).toBe(true);
    expect(boundedMutableSortDrift({ ...baseline, matchedIdentities: 8 })).toBe(
      false,
    );
    expect(boundedMutableSortDrift({ ...baseline, localTotal: 2_962 })).toBe(
      true,
    );
    expect(boundedMutableSortDrift({ ...baseline, localTotal: 2_800 })).toBe(
      false,
    );
  });

  it("bounds drift in fixed-size recommendation collections", () => {
    expect(
      boundedFixedCollectionDrift({
        productionItems: 5,
        localItems: 5,
        matchedIdentities: 4,
        maximumIdentityDrift: 1,
      }),
    ).toBe(true);
    expect(
      boundedFixedCollectionDrift({
        productionItems: 5,
        localItems: 5,
        matchedIdentities: 3,
        maximumIdentityDrift: 1,
      }),
    ).toBe(false);
    expect(
      boundedFixedCollectionDrift({
        productionItems: 2,
        localItems: 3,
        matchedIdentities: 2,
        maximumIdentityDrift: 0,
      }),
    ).toBe(false);
  });

  it("allows optional sampled paths but rejects incompatible shared types", () => {
    const collector = (value: JsonValue): string[] => {
      const output: string[] = [];
      const visit = (current: JsonValue, path: string): void => {
        if (Array.isArray(current)) {
          output.push(`${path}:array`);
          current.forEach(item => visit(item, `${path}[]`));
        } else if (current === null) {
          output.push(`${path}:null`);
        } else if (typeof current === "object") {
          output.push(`${path}:object`);
          Object.entries(current).forEach(([key, item]) =>
            visit(item, `${path}.${key}`),
          );
        } else {
          output.push(`${path}:${typeof current}`);
        }
      };
      visit(value, "$");
      return [...new Set(output)].sort();
    };

    expect(
      compatibleSampledContracts(
        [{ id: "a", optional: null }],
        [{ id: "b", optional: "present" }],
        collector,
      ),
    ).toBe(true);
    expect(
      compatibleSampledContracts(
        [{ id: "a", optional: 1 }],
        [{ id: "b", optional: "wrong" }],
        collector,
      ),
    ).toBe(false);
  });

  it("classifies catastrophic mapper truncation beyond the current page", () => {
    expect(
      truncatedProductionCollection({
        productionTotal: 27,
        localTotal: 13_290,
        productionItems: 20,
        requestedPage: 1,
        requestedLimit: 20,
        exactContractMatch: false,
      }),
    ).toBe(true);
    expect(
      truncatedProductionCollection({
        productionTotal: 27,
        localTotal: 30,
        productionItems: 20,
        requestedPage: 1,
        requestedLimit: 20,
        exactContractMatch: false,
      }),
    ).toBe(false);
  });

  it("classifies missing successful collection envelopes as unusable", () => {
    expect(
      truncatedProductionCollection({
        localTotal: 4,
        productionItems: 0,
        requestedPage: 1,
        requestedLimit: 20,
        exactContractMatch: false,
      }),
    ).toBe(true);
  });

  it("classifies only long-running empty-success production fallbacks", () => {
    const fallback = {
      productionStatus: 200,
      productionElapsedMs: 70_000,
      productionBytes: 40,
      productionTotal: 0,
      productionItems: 0,
      localTotal: 40,
      localItems: 20,
    };

    expect(longRunningEmptySuccessFallback(fallback)).toBe(true);
    expect(
      longRunningEmptySuccessFallback({
        ...fallback,
        productionElapsedMs: 10_000,
      }),
    ).toBe(false);
    expect(
      longRunningEmptySuccessFallback({
        ...fallback,
        localTotal: 0,
        localItems: 0,
      }),
    ).toBe(false);
    expect(
      longRunningEmptySuccessFallback({
        ...fallback,
        productionItems: 1,
      }),
    ).toBe(false);
  });
});

const job = (
  shortUUID: string,
  access: "public" | "protected",
  timestamp: number,
): JsonValue => ({
  shortUUID,
  access,
  timestamp,
  featured: false,
  organization: { projects: [], fundingRounds: [] },
});
