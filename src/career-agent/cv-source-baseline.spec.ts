import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  applyCvBaselineChanges,
  assertCvBaselineCurrent,
  buildCvBaseline,
  CvBaselineSource,
} from "./cv-source-baseline";

const source: CvBaselineSource = {
  id: "owned-source",
  contentHash: "original-file-hash",
  sourceText: [
    "Alex Candidate\nPlatform engineer\n",
    "2022–present | Product A | Senior engineer\nBuilt checkout services and mentored engineers.\n",
    "2019–2022 | Product B | Engineer\nMaintained billing infrastructure.\n",
    "2016–2019 | Product C | Developer\nBuilt internal support tools.\n",
    "Education\nBSc Computer Science\n",
  ].join("\n"),
};

describe("Complete source CV baselines", () => {
  it("keeps the complete career, education and contact context before any tailored changes", () => {
    const baseline = buildCvBaseline(source);
    const draft = applyCvBaselineChanges(baseline, []);
    expect(draft.entries.map(entry => entry.original).join("")).toBe(source.sourceText);
    expect(draft.entries.map(entry => entry.text).join("")).toBe(source.sourceText);
    for (const role of ["Product A", "Product B", "Product C", "BSc Computer Science"])
      expect(draft.entries.some(entry => entry.text.includes(role))).toBe(true);
    expect(buildCvBaseline({ ...source })).toEqual(baseline);
  });

  it("compresses a selected role while retaining unmentioned history and earlier saved edits", () => {
    const baseline = buildCvBaseline(source);
    const recent = baseline.entries.find(entry => entry.text.includes("Product A"))!;
    const older = baseline.entries.find(entry => entry.text.includes("Product B"))!;
    const rewritten = "2022–present | Product A | Senior engineer\nOwned checkout services; mentored engineers.\n\n";
    const first = applyCvBaselineChanges(baseline, [{ entryId: recent.id, text: rewritten }]);
    const second = applyCvBaselineChanges(first, [{ entryId: older.id, text: "2019–2022 | Product B | Engineer — billing infrastructure.\n\n" }]);
    expect(second.entries.find(entry => entry.id === recent.id)).toEqual({ id: recent.id, original: recent.text, text: rewritten });
    expect(second.entries.filter(entry => entry.id !== recent.id && entry.id !== older.id))
      .toEqual(first.entries.filter(entry => entry.id !== recent.id && entry.id !== older.id));
    expect(second.entries.map(entry => entry.original).join("")).toBe(source.sourceText);
    expect(source.sourceText).toBe(baseline.entries.map(entry => entry.text).join(""));
  });

  it("allows explicit complete reordering without losing original provenance", () => {
    const draft = applyCvBaselineChanges(buildCvBaseline(source), []);
    const order = draft.entries.map(entry => entry.id).reverse();
    const reordered = applyCvBaselineChanges(draft, [], order);
    assertCvBaselineCurrent(reordered, source);
    expect(reordered.entries.map(entry => entry.id)).toEqual(order);
    expect(new Map(reordered.entries.map(entry => [entry.id, entry.original])))
      .toEqual(new Map(draft.entries.map(entry => [entry.id, entry.original])));
  });

  it.each([
    { ...source, id: "different-owned-source" },
    { ...source, contentHash: "replaced-file" },
    { ...source, sourceText: source.sourceText.replace("Product A", "Corrected company") },
  ])("rejects stale or substituted source identity", current => {
    const draft = applyCvBaselineChanges(buildCvBaseline(source), []);
    expect(() => assertCvBaselineCurrent(draft, current)).toThrow(ConflictException);
    const priorIds = new Set(draft.entries.map(entry => entry.id));
    expect(buildCvBaseline(current).entries.every(entry => !priorIds.has(entry.id))).toBe(true);
  });

  it("rejects missing history, duplicated entries and substituted immutable text", () => {
    const draft = applyCvBaselineChanges(buildCvBaseline(source), []);
    expect(() => assertCvBaselineCurrent({ ...draft, entries: draft.entries.slice(1) }, source)).toThrow(ConflictException);
    expect(() => assertCvBaselineCurrent({ ...draft, entries: draft.entries.map((entry, index) => index === 1 ? draft.entries[0] : entry) }, source)).toThrow(ConflictException);
    expect(() => assertCvBaselineCurrent({ ...draft, entries: draft.entries.map((entry, index) => index === 0 ? { ...entry, original: "Fabricated original" } : entry) }, source)).toThrow(ConflictException);
    expect(() => assertCvBaselineCurrent({ ...draft, entries: draft.entries.map((entry, index) => index === 0 ? { ...entry, text: " " } : entry) }, source)).toThrow(ConflictException);
  });

  it("rejects partial orders, stale entry IDs and empty rewrites instead of treating them as exclusions", () => {
    const baseline = buildCvBaseline(source);
    const ids = baseline.entries.map(entry => entry.id);
    for (const order of [ids.slice(1), [...ids.slice(1), ids[1]], [...ids.slice(1), "unknown"]])
      expect(() => applyCvBaselineChanges(baseline, [], order)).toThrow(BadRequestException);
    for (const text of ["", "\n \t", "x\0y", "x".repeat(20001)])
      expect(() => applyCvBaselineChanges(baseline, [{ entryId: ids[0], text }])).toThrow(BadRequestException);
    expect(() => applyCvBaselineChanges(baseline, [{ entryId: "unknown", text: "Replacement" }])).toThrow(BadRequestException);
    expect(() => applyCvBaselineChanges(baseline, [{ entryId: ids[0], text: "First" }, { entryId: ids[0], text: "Second" }])).toThrow(BadRequestException);
  });

  it.each([
    " \r\nName\r\n\r\nRole α\rResponsibilities\n\nEducation\fFinal page\n \t",
    "First role\n" + "Long responsibility text. ".repeat(250) + "\nEarlier role\nContinued work\n",
    "A".repeat(100000),
    "Role\n\n\n",
  ])("retains exact full text across extraction boundaries and long source blocks", sourceText => {
    const current = { ...source, sourceText };
    const baseline = buildCvBaseline(current);
    const draft = applyCvBaselineChanges(baseline, []);
    assertCvBaselineCurrent(draft, current);
    expect(baseline.entries.map(entry => entry.text).join("")).toBe(sourceText);
    expect(draft.entries.map(entry => entry.text).join("")).toBe(sourceText);
    expect(draft.entries.every(entry => entry.original.trim())).toBe(true);
  });

  it("does not manufacture a baseline for a source without readable text", () => {
    expect(() => buildCvBaseline({ ...source, sourceText: " \n\t" })).toThrow(BadRequestException);
  });
});
