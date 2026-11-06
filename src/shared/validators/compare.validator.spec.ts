import { ValidationArguments, validate } from "class-validator";
import { Compare, CompareConstraint } from "./compare.validator";

const args = (
  operator: string | null | undefined,
  target: unknown,
  comparator?: (left: unknown, right: unknown) => boolean,
): ValidationArguments => ({
  targetName: "Range",
  property: "maximum",
  value: undefined,
  object: { minimum: target },
  constraints: ["minimum", operator, comparator],
});

describe("CompareConstraint", () => {
  const constraint = new CompareConstraint();

  it("retains null-skipping and undefined-value comparison semantics", () => {
    expect(constraint.validate(null, args(">=", 5))).toBe(true);
    expect(constraint.validate(1, args(">=", undefined))).toBe(true);
    expect(constraint.validate(1, args(">=", null))).toBe(true);
    expect(constraint.validate(undefined, args(">=", 5))).toBe(false);
  });

  it.each([
    ["==", "5", 5, true],
    ["===", "5", 5, false],
    [">", 6, 5, true],
    ["<", 6, 5, false],
    ["!=", "5", 5, false],
    ["!==", "5", 5, true],
    [">=", 5, 5, true],
    ["<=", 5, 5, true],
  ])(
    "preserves JavaScript comparison for %s",
    (operator, value, target, expected) => {
      expect(constraint.validate(value, args(String(operator), target))).toBe(
        expected,
      );
    },
  );

  it("uses a comparator only for the explicit null operator contract", () => {
    const comparator = jest.fn().mockReturnValue(true);
    expect(constraint.validate(1, args(null, 2, comparator))).toBe(true);
    expect(comparator).toHaveBeenCalledWith(1, 2);
    comparator.mockClear();
    expect(constraint.validate(1, args(undefined, 2, comparator))).toBe(false);
    expect(comparator).not.toHaveBeenCalled();
  });

  it("registers the decorator against the object's constructor", async () => {
    class Range {
      minimum = 10;
      @Compare("minimum", ">=")
      maximum = 9;
    }
    const range = new Range();
    const errors = await validate(range);
    expect(errors[0].constraints.Compare).toBe("maximum is not >= minimum");
    range.maximum = 10;
    expect(await validate(range)).toEqual([]);
  });
});
