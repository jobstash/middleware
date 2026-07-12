import {
  intConverter,
  losslessInteger,
  paginate,
  slugify,
  sprinkleProtectedJobs,
} from ".";

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
});
