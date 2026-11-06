import {
  hasDuplicates,
  intConverter,
  inferObjectType,
  isValidUrl,
  nonZeroOrNull,
  losslessInteger,
  paginate,
  slugify,
  slugifyFacetLabel,
  sprinkleProtectedJobs,
  uuidfy,
} from ".";
import extractDomain from "./extract-domain";
import { emojiRegex } from "./emoji-regex";

describe("Helpers", () => {
  it("should paginate correctly", () => {
    const list = new Array(30)
      .fill(1)
      .map((value, index) => value * (index + 1));
    const page = 1;
    const limit = 10;
    expect(list.slice(0, 10)).toEqual(paginate<number>(page, limit, list).data);
  });

  it("should slugify correctly", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("маленький подъезд")).toBe("malenkiy-podezd");
    expect(slugify("株式会社コミュニティオ")).toBe(
      "zhu-shi-hui-she-komiyuniteio",
    );
    expect(slugify("コミュニティオ採用サイト")).toBe(
      "komiyuniteiocai-yong-saito",
    );
    expect(slugify("(주)스트리미")).toBe("juseuteurimi");
  });

  it.each([
    ["Europe/Amsterdam", "europe-amsterdam"],
    ["UTC+2", "utc-2"],
    ["Zürich, Switzerland", "zurich-switzerland"],
  ])("should produce SQL-compatible facet slugs for %s", (input, expected) => {
    expect(slugifyFacetLabel(input)).toBe(expected);
  });

  it.each([
    [undefined, 0],
    [null, 0],
    [42, 42],
    [{ low: -1, high: 0 }, 4_294_967_295],
    [{ low: 0, high: 1 }, 4_294_967_296],
    [{ low: 0, high: -1 }, -4_294_967_296],
  ])(
    "converts graph integer representations without a driver",
    (value, expected) => {
      expect(intConverter(value)).toBe(expected);
    },
  );

  it.each([
    [0, { low: 0, high: 0 }],
    [1_783_713_133_315, { low: 1_301_705_475, high: 415 }],
    [4_294_967_295, { low: -1, high: 0 }],
    [4_294_967_296, { low: 0, high: 1 }],
    [-1, { low: -1, high: -1 }],
  ])("emits compatible lossless integer objects", (value, expected) => {
    expect(losslessInteger(value)).toEqual(expected);
  });

  it("sprinkles protected jobs across the legacy priority window", () => {
    const random = jest.spyOn(Math, "random").mockReturnValue(0.5);
    const publicJobs = Array.from({ length: 2_579 }, (_, index) => ({
      id: `public-${index}`,
      access: "public" as const,
    }));
    const protectedJobs = Array.from({ length: 45 }, (_, index) => ({
      id: `protected-${index}`,
      access: "protected" as const,
    }));

    const sprinkled = sprinkleProtectedJobs([
      publicJobs[0],
      protectedJobs[0],
      ...publicJobs.slice(1),
      ...protectedJobs.slice(1),
    ]);

    expect(sprinkled).toHaveLength(2_624);
    expect(
      sprinkled.slice(0, 20).filter(job => job.access === "protected"),
    ).toHaveLength(4);
    expect(
      sprinkled.filter(job => job.access === "public").map(job => job.id),
    ).toEqual(publicJobs.map(job => job.id));
    expect(
      sprinkled.filter(job => job.access === "protected").map(job => job.id),
    ).toEqual(protectedJobs.map(job => job.id));
    random.mockRestore();
  });

  it.each([
    ["---Europe///Amsterdam---", "europe-amsterdam"],
    ["-".repeat(10_000) + "UTC+2" + "-".repeat(10_000), "utc-2"],
    ["---", "---"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ])("trims only collapsed facet boundaries", (input, expected) => {
    expect(slugifyFacetLabel(input)).toBe(expected);
  });

  it("preserves duplicate logging and actionable extractor order", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const rows = [
      { id: "b", value: "one" },
      { id: "a", value: "two" },
      { id: "b", value: "three" },
    ];
    const extract = jest.fn((row: (typeof rows)[number]) => row.value);
    try {
      expect(hasDuplicates(rows, "Row", row => row.id, extract)).toBe(true);
      expect(extract.mock.calls.map(([row]) => row.value)).toEqual([
        "one",
        "three",
      ]);
      expect(log).toHaveBeenCalledWith(
        "Row 'b' is found 2 times at indexes: 0 and 2.\n        Relevant data:\n          idx 0: one\n            idx 2: three",
      );
      log.mockClear();
      extract.mockClear();
      expect(
        hasDuplicates(rows.slice(0, 2), "Row", row => row.id, extract),
      ).toBe(false);
      expect(log).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    [undefined, null],
    [null, null],
    [0, null],
    ["0", 0],
    ["", 0],
    ["invalid", null],
    [{ low: -1, high: 0 }, 4_294_967_295],
  ])("preserves numeric normalization distinctions", (input, expected) => {
    expect(nonZeroOrNull(input)).toBe(expected);
  });

  it("retains ordered type unions and sparse array handling", () => {
    expect(inferObjectType([])).toBe("Array<undefined>");
    expect(inferObjectType([1, "a", 2])).toBe("Array<number | string>");
    expect(inferObjectType([, 1])).toBe("Array<undefined | number>");
  });

  it("normalizes invalid URL errors without accepting usernames", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(() => isValidUrl("@example")).toThrow("Not a valid URL: @example");
    expect(() => isValidUrl("not a url")).toThrow("Not a valid URL: not a url");
  });

  it("retains UTF-16 code-unit based generated identifiers", () => {
    expect(uuidfy("\uD83D\uDE00-token")).toBe(uuidfy("\uD83D\uDE01-token"));
    expect(uuidfy("\uD83D\uDE00-token")).not.toBe(uuidfy("a-token"));
  });

  it("keeps the historical emoji table and keycap matches", () => {
    expect("*\u20e3 #\u20e3 1\u20e3".match(emojiRegex())).toEqual([
      "*\u20e3",
      "#\u20e3",
      "1\u20e3",
    ]);
    expect("🇺🇸".match(emojiRegex())).toEqual(["🇺🇸"]);
    expect("🇦🇦".match(emojiRegex())).toBeNull();
    expect("\u{1FAE0}".match(emojiRegex())).toBeNull();
  });

  it.each([
    ["https://sub.example.co.uk/path", "co.uk"],
    ["https://user@example.com:443/path", "example.com"],
    ["example.com/path", "example.com/path"],
    [".a.com", ""],
  ])("preserves legacy domain slicing for %s", (input, expected) => {
    expect(extractDomain(input)).toBe(expected);
  });

  it("resolves registrable domains only for the tld option", async () => {
    await expect(
      extractDomain("https://sub.example.co.uk/path", { tld: true }),
    ).resolves.toBe("example.co.uk");
    expect(
      extractDomain(["https://example.com", "https://example.org"]),
    ).toEqual(["example.com", "example.org"]);
  });

  it("preserves protected ordering when public jobs run out", () => {
    const random = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const publicJobs = [{ id: "public", access: "public" as const }];
      const protectedJobs = Array.from({ length: 205 }, (_, index) => ({
        id: `protected-${index}`,
        access: "protected" as const,
      }));
      const result = sprinkleProtectedJobs([...publicJobs, ...protectedJobs]);
      expect(result).toEqual([...protectedJobs, ...publicJobs]);
      expect(sprinkleProtectedJobs(publicJobs)).toEqual(publicJobs);
      expect(sprinkleProtectedJobs(protectedJobs)).toEqual(protectedJobs);
      expect(sprinkleProtectedJobs([])).toEqual([]);
    } finally {
      random.mockRestore();
    }
  });
});
