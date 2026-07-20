import {
  normalizeAdminDirectoryQuery,
  parseAdminDirectoryPagination,
} from "./admin-directory";

describe("admin directory query helpers", () => {
  it("uses bounded defaults for missing and invalid pagination", () => {
    expect(parseAdminDirectoryPagination()).toEqual({ limit: 25, offset: 0 });
    expect(parseAdminDirectoryPagination("invalid", "invalid")).toEqual({
      limit: 25,
      offset: 0,
    });
    expect(parseAdminDirectoryPagination("10000", "-10")).toEqual({
      limit: 100,
      offset: 0,
    });
  });

  it("trims and bounds search input", () => {
    expect(normalizeAdminDirectoryQuery("  Acme  ")).toBe("Acme");
    expect(normalizeAdminDirectoryQuery("   ")).toBeUndefined();
    expect(normalizeAdminDirectoryQuery("a".repeat(500))).toHaveLength(200);
  });
});
