import { proseLinkLabels, replaceProseTags } from "./recommendation-markup";
import { recommendationSentences } from "./recommendation-sentences";

const tags = (value: string): string => replaceProseTags(value, () => " ");

describe("recommendation prose markup", () => {
  it.each([
    ["Build <b>Rust</b> services", "Build  Rust  services"],
    ["<broken <b>text", " text"],
    ["<>visible", "<>visible"],
    ["<unfinished", "<unfinished"],
  ])("projects tags without changing malformed text: %s", (input, expected) => {
    expect(tags(input)).toBe(expected);
  });

  it.each([
    ["[label](url)", "label"],
    ["![image](url)", "!image"],
    ["[](url)", "[](url)"],
    ["[label]()", "[label]()"],
    ["[[label](url)", "[label"],
    ["[label](a(b)c)", "labelc)"],
    ["[missing](url", "[missing](url"],
  ])("preserves recommendation link grammar: %s", (input, expected) => {
    expect(proseLinkLabels(input)).toBe(expected);
  });

  it("preserves large unmatched delimiters rather than clipping input", () => {
    const angles = "<".repeat(100_000);
    const brackets = "[".repeat(100_000);
    const urls = "[label](".repeat(10_000);
    expect(tags(angles)).toBe(angles);
    expect(proseLinkLabels(brackets)).toBe(brackets);
    expect(proseLinkLabels(urls)).toBe(urls);
    expect(tags(angles + ">tail")).toBe(" tail");
    expect(proseLinkLabels(brackets + "x](url)")).toBe(brackets.slice(1) + "x");
  });

  it("recognizes structural breaks inside malformed outer tags and decodes entities", () => {
    const result = recommendationSentences(
      JSON.stringify([
        {
          source: "requirements",
          text: "Build Rust services.\n<broken <br>Operate &amp; maintain&nbsp;databases.",
        },
      ]),
    );
    expect(result.map(sentence => sentence.text)).toEqual([
      "Build Rust services.",
      "<broken",
      "Operate & maintain databases.",
    ]);
  });
});
