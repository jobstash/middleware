import { paginate, slugify } from ".";

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
});
