import { containsEmailLikeValue, isEmailLikeValue } from "./email-like-values";

describe("email-shaped redaction", () => {
  it.each([
    ["candidate@example.com", true, true],
    ["reach candidate@example.com today", false, true],
    ["(candidate@example.com)", true, true],
    ["candidate@.com", false, false],
    ["candidate@..com", true, true],
    ["candidate@example.", false, false],
    ["candidate@@example.com", false, false],
    ["!!!@example.com", true, false],
    ["candidate@example.!!!", true, false],
    ["candidate@example.!!!x", true, true],
    ["public prose", false, false],
    ["candidate@exa mple.com", false, false],
  ])(
    "preserves anchored and embedded contact grammar: %s",
    (value, anchored, embedded) => {
      expect(isEmailLikeValue(value)).toBe(anchored);
      expect(containsEmailLikeValue(value)).toBe(embedded);
    },
  );

  it("handles long near misses and contacts at the end without truncation", () => {
    const run = "x".repeat(100_000);
    expect(isEmailLikeValue(run + "@" + run)).toBe(false);
    expect(containsEmailLikeValue(run + "@" + run)).toBe(false);
    expect(isEmailLikeValue(run + "@" + run + ".com")).toBe(true);
    expect(containsEmailLikeValue(run + " contact:person@example.com")).toBe(
      true,
    );
    expect(
      containsEmailLikeValue("@".repeat(100_000) + "person@example.com"),
    ).toBe(true);
  });
});
