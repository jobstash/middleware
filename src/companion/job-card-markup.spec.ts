import { proseLinkLabels } from "src/auth/profile/recommendation-markup";
import { projectJobSalary } from "./job-card-details";
import { withoutExecutableBlocks } from "./job-card-markup";

describe("companion job card text", () => {
  it.each([
    ["![label](url)", "label"],
    ["[](url)", ""],
    ["[label]()", "label"],
    ["[label](a(b)c)", "label"],
    ["[label](a(b(c))d)", "[label](a(b(c))d)"],
    ["[broken](url", "[broken](url"],
  ])(
    "preserves image and one-level nested URL grammar: %s",
    (input, expected) => {
      expect(proseLinkLabels(input, true)).toBe(expected);
    },
  );

  it.each([
    ["a<script>x</script>b<style>y</style>c", "abc"],
    ["a<SCRIPT type=x>one<script>two</SCRIPT >tail", "atail"],
    ["<script>unclosed", "<script>unclosed"],
    ["<style><script>x</script>", "<style>"],
  ])("removes only complete executable blocks: %s", (input, expected) => {
    expect(withoutExecutableBlocks(input)).toBe(expected);
  });

  it("preserves large unmatched script and link input", () => {
    const scripts = "<script>".repeat(20_000);
    const links = "![label](".repeat(20_000);
    expect(withoutExecutableBlocks(scripts)).toBe(scripts);
    expect(withoutExecutableBlocks(scripts + "</script>tail")).toBe("tail");
    expect(proseLinkLabels(links, true)).toBe(links);
    expect(proseLinkLabels("[label](" + "(".repeat(100_000), true)).toBe(
      "[label](" + "(".repeat(100_000),
    );
  });

  it("retains salary period and display projection contracts", () => {
    expect(
      projectJobSalary({
        minimumSalary: 100,
        salaryCurrency: "<b>USD</b>",
        payRate: "MONTHLY",
      }),
    ).toMatchObject({ currency: "USD", period: "year" });
    expect(
      projectJobSalary({
        extractedMinimumSalary: 100,
        salaryCurrency: "![USD](url)",
        payRate: "MONTHLY",
      }),
    ).toMatchObject({ currency: "USD", period: "month" });
    expect(projectJobSalary({ minimumSalary: 100 })).toMatchObject({
      period: null,
    });
  });
});
