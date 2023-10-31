import { paginate } from ".";

describe("Helpers", () => {
  it("should paginate correctly", () => {
    const list = new Array(30)
      .fill(1)
      .map((value, index) => value * (index + 1));
    const page = 1;
    const limit = 10;
    expect(list.slice(0, 10)).toEqual(paginate<number>(page, limit, list).data);
  });
});
