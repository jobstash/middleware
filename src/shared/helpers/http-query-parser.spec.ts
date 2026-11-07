import { BadRequestException } from "@nestjs/common";
import { parseHttpQuery } from "./http-query-parser";

describe("parseHttpQuery", () => {
  it("returns an empty object when the URL has no query string", () => {
    // Express hands the parser `null` for a bare path such as GET /jobs/list.
    expect(parseHttpQuery(null)).toEqual({});
    expect(parseHttpQuery(undefined)).toEqual({});
    expect(parseHttpQuery("")).toEqual({});
  });

  it("parses extended syntax", () => {
    expect(parseHttpQuery("a=1&b[]=2&b[]=3")).toEqual({
      a: "1",
      b: ["2", "3"],
    });
  });

  it("rejects prototype-shaped keys", () => {
    expect(() => parseHttpQuery("__proto__[x]=1")).toThrow(
      BadRequestException,
    );
  });
});
