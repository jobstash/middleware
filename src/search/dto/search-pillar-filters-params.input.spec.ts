import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SearchPillarFiltersParams } from "./search-pillar-filters-params.input";

const booleanFields = [
  "hasProjects",
  "hasJobs",
  "newActiveLeads",
  "steppedDownLeads",
  "movedLeads",
  "earlyLeadDepartures",
  "recentlyFunded",
  "hasAudits",
  "hasHacks",
  "hasToken",
] as const;

describe("SearchPillarFiltersParams boolean filters", () => {
  it.each(booleanFields)("preserves strict boolean parsing for %s", field => {
    for (const [input, expected] of [
      ["true", true],
      ["false", false],
      [true, true],
      [false, false],
      [null, null],
    ]) {
      const params = plainToInstance(SearchPillarFiltersParams, {
        nav: "projects",
        [field]: input,
      });
      expect(params[field]).toBe(expected);
      expect(
        validateSync(params).filter(error => error.property === field),
      ).toEqual([]);
    }
    for (const input of ["TRUE", "0", "", 0, 1, {}, ["true"]]) {
      const params = plainToInstance(SearchPillarFiltersParams, {
        nav: "projects",
        [field]: input,
      });
      expect(validateSync(params).some(error => error.property === field)).toBe(
        true,
      );
    }
  });

  it("leaves omitted boolean filters unset", () => {
    const params = plainToInstance(SearchPillarFiltersParams, {
      nav: "projects",
    });
    for (const field of booleanFields) expect(params[field]).toBeNull();
  });
});
