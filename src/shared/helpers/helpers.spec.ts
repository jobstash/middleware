import { intConverter, paginate, slugify } from ".";

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
});
