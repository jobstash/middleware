import { generateFilterMatrix } from "./filter-parity-matrix";
import type { FilterEndpointSpec } from "./filter-parity-matrix";
import type * as Parity from "./compare-production-parity";
import type * as FilterParity from "./compare-production-filter-parity";

describe("offline production parity transformations", () => {
  let parity: typeof Parity;
  let filters: typeof FilterParity;
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(
        new Error("Network forbidden in offline parity tests"),
      );
    const previous = process.env.PARITY_PRODUCTION_URL;
    process.env.PARITY_PRODUCTION_URL = "https://parity.invalid";
    try {
      parity = jest.requireActual("./compare-production-parity");
      filters = jest.requireActual("./compare-production-filter-parity");
    } finally {
      if (previous === undefined) delete process.env.PARITY_PRODUCTION_URL;
      else process.env.PARITY_PRODUCTION_URL = previous;
    }
  });
  afterAll(() => fetchSpy.mockRestore());

  it.each([
    ["/jobs/{id}", "/jobs/parity-probe"],
    ["/{id}/{slug}", "/parity-probe/parity-probe"],
    ["/{}{{id}}/{unfinished", "/{}parity-probe}/{unfinished"],
    ["/literal", "/literal"],
    ["/{" + "{".repeat(20_000), "/{" + "{".repeat(20_000)],
  ])("materializes only nonempty complete parameters: %s", (path, expected) => {
    expect(parity.materializePath(path)).toBe(expected);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("compares collection item shapes by identity rather than position", () => {
    const result = parity.compareResponseBodies(
      {
        data: [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
        ],
      },
      {
        data: [
          { id: "b", value: "changed" },
          { id: "a", value: 1 },
        ],
      },
      { path: "/items", collectionIdentity: "id" },
    );
    expect(result.matchedItems).toBe(2);
    expect(result.shapeMatch).toBe(false);
    expect(result.missingTypes.some(value => value.includes("data[b]"))).toBe(
      true,
    );
    expect(result.extraTypes.some(value => value.includes("data[b]"))).toBe(
      true,
    );
  });

  const spec: FilterEndpointSpec = {
    operationId: "Offline_list",
    path: "/items",
    identityKey: "id",
    parameters: [],
  };
  const response = (
    status: number,
    body: {
      data: { id: string; nested?: number[] }[];
      total: number;
      page: number;
    },
  ) => ({ status, body, bytes: 100, elapsedMs: 10 });

  it("retains exact successful filter matches and bounded nested differences", () => {
    const matrixCase = generateFilterMatrix(spec, "single")[0];
    const production = response(200, {
      data: [{ id: "a", nested: [1, 2] }],
      total: 1,
      page: 1,
    });
    const exact = filters.compareFilterResponses(
      spec,
      matrixCase,
      production,
      production,
    );
    expect(exact).toMatchObject({
      identityComparison: "exact",
      semanticMatch: true,
      baselineUnavailable: false,
      failureReasons: [],
    });
    const changed = response(200, {
      data: [{ id: "a", nested: [1, 3, 4] }],
      total: 1,
      page: 1,
    });
    const mismatch = filters.compareFilterResponses(
      spec,
      matrixCase,
      production,
      changed,
    );
    expect(mismatch.failureReasons).toContain("response-value-mismatch");
    expect(
      mismatch.valueDifferences.some(value => value.includes("nested.length")),
    ).toBe(true);
    expect(
      mismatch.valueDifferences.some(value => value.includes("nested[1]")),
    ).toBe(true);
  });

  it("retains sorted nested object traversal and the thirty-difference bound", () => {
    const fields = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `key${index.toString().padStart(2, "0")}`,
        index,
      ]).reverse(),
    );
    const changed = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Number(value) + 1]),
    );
    const base = response(200, { data: [], total: 1, page: 1 });
    const mismatch = filters.compareFilterResponses(
      spec,
      generateFilterMatrix(spec, "single")[0],
      {
        ...base,
        body: { data: [{ id: "a", nested: fields }], total: 1, page: 1 },
      },
      {
        ...base,
        body: { data: [{ id: "a", nested: changed }], total: 1, page: 1 },
      },
    );
    expect(mismatch.valueDifferences).toHaveLength(30);
    expect(mismatch.valueDifferences[0]).toContain("nested.key00:");
    expect(mismatch.valueDifferences.at(-1)).toContain("nested.key29:");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not treat a failing production baseline as a passing contract", () => {
    const matrixCase = generateFilterMatrix(spec, "single")[0];
    const body = { data: [], total: 0, page: 1 };
    expect(
      filters.compareFilterResponses(
        spec,
        matrixCase,
        response(503, body),
        response(200, body),
      ),
    ).toMatchObject({
      baselineUnavailable: true,
      contractMatch: false,
      failureReasons: ["production-baseline-unavailable:503"],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
