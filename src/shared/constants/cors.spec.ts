import { BROWSER_CORS_HEADERS, BROWSER_CORS_METHODS } from "./cors";

describe("browser CORS contract", () => {
  it("allows every browser-consumed mutation method", () => {
    expect(BROWSER_CORS_METHODS).toEqual(
      expect.arrayContaining(["POST", "PUT", "PATCH", "DELETE"]),
    );
  });

  it("allows ecosystem and white-label request headers", () => {
    expect(BROWSER_CORS_HEADERS).toEqual(
      expect.arrayContaining([
        "authorization",
        "content-type",
        "x-ecosystem",
        "x-white-label-board-domain",
        "x-white-label-board-route",
      ]),
    );
  });
});
