import { recommendationSentences } from "./recommendation-sentences";

const split = (text: string, source = "requirements", context?: string) =>
  recommendationSentences(JSON.stringify([{ source, text, context }]));

describe("recommendation sentence inputs", () => {
  it("embeds sentences and bullet requirements separately, not the document", () => {
    expect(
      split(
        "Build distributed systems. Operate production databases.\n- Implement fault recovery\n• Review protocol security",
      ).map(s => s.text),
    ).toEqual([
      "Build distributed systems.",
      "Operate production databases.",
      "Implement fault recovery",
      "Review protocol security",
    ]);
  });
  it("handles HTML, Markdown links and JSON arrays", () => {
    expect(
      split(
        "<p>Build <b>Rust</b> services.</p><li>Operate [databases](https://example.test).</li>",
      ).map(s => s.text),
    ).toEqual(["Build Rust services.", "Operate databases."]);
    expect(
      split(
        JSON.stringify(["Build Rust services", "Operate production databases"]),
      ).map(s => s.text),
    ).toEqual(["Build Rust services", "Operate production databases"]);
  });
  it("retains negation and attaches only the short role context", () => {
    expect(
      split(
        "No commercial experience required. Do not operate production databases.",
        "experience",
        "Research engineer",
      ).map(s => s.text),
    ).toEqual([
      "Research engineer: No commercial experience required.",
      "Research engineer: Do not operate production databases.",
    ]);
  });
  it("excludes application and benefits boilerplate", () => {
    expect(
      split(
        "Apply now. We are an equal opportunity employer. We offer competitive salary. Build Rust services.",
      ).map(s => s.text),
    ).toEqual(["Build Rust services."]);
  });
  it("keeps generic text below the relevance threshold", () => {
    for (const s of split(
      "We are a dynamic team. Excellent communication skills. Fast-paced environment. Team player.",
    ))
      expect(s.weight).toBeLessThan(0.35);
    expect(split("Rust", "preference")[0].weight).toBe(1);
  });
  it("deduplicates repeated sentences across source fields with the strongest weight", () => {
    const result = recommendationSentences(
      JSON.stringify([
        {
          source: "summary",
          text: "Build Rust services. Build Rust services.",
        },
        { source: "requirements", text: "Build Rust services." },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ weight: 1, source: "requirements" });
  });
  it("keeps unchanged sentence hashes stable when surrounding text changes", () => {
    expect(split("Build Rust services.")[0].hash).toBe(
      split("Build Rust services. Operate databases.")[0].hash,
    );
  });
  it("rejects an oversized sentence instead of silently truncating it", () => {
    expect(() => split("word ".repeat(8200))).toThrow(
      "Sentence exceeds embedding token limit",
    );
  });
});
