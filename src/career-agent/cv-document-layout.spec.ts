import { buildCvPresentation } from "./cv-document-layout";
import { applyCvBaselineChanges, buildCvBaseline } from "./cv-source-baseline";

const baseline = (sourceText: string) => applyCvBaselineChanges(buildCvBaseline({
  id: "owned-source", contentHash: "source-hash", sourceText,
}), []);

describe("source-preserving CV presentation", () => {
  it("groups explicit experience metadata and achievements without inventing a location", () => {
    const source = baseline("Sample Candidate\ncontact@example.invalid\n\nEXPERIENCE\nExample Company | Staff Engineer\n\nJanuary 2020 – Present\n● Delivered reliable payments.\nContinued achievement context.\n\nAn unclassified detail stays here.\n\nEDUCATION\nComputer Science, 2010.");
    const original = JSON.stringify(source);
    expect(buildCvPresentation(source, { name: "sample candidate" })).toEqual({
      header: { name: "Sample Candidate", contactLines: ["contact@example.invalid"] },
      blocks: [
        { kind: "section", title: "EXPERIENCE" },
        { kind: "experience", company: "Example Company", role: "Staff Engineer", dates: "January 2020 – Present", items: [
          { kind: "bullet", text: "Delivered reliable payments. Continued achievement context." },
          { kind: "paragraph", text: "An unclassified detail stays here." },
        ] },
        { kind: "section", title: "EDUCATION" },
        { kind: "paragraph", text: "Computer Science, 2010." },
      ],
    });
    expect(JSON.stringify(source)).toBe(original);
  });

  it("renders saved identity metadata when a tailored body starts with its profile section", () => {
    const source = baseline("PROFILE\nEngineering leader.\n\nEXPERIENCE\nExample Company | Manager\n2020–Present\n• Coached engineers.");
    const presentation = buildCvPresentation(source, {
      name: "Sample Candidate", contact: "contact@example.invalid", location: "Amsterdam, Netherlands",
    });
    expect(presentation.header).toEqual({
      name: "Sample Candidate", contactLines: ["contact@example.invalid", "Amsterdam, Netherlands"],
    });
    expect(presentation.blocks[0]).toEqual({ kind: "section", title: "PROFILE" });
  });

  it("does not duplicate or replace an explicitly edited inline contact header", () => {
    const source = baseline("Sample Candidate\nnew@example.invalid\n\nPROFILE\nEngineering leader.");
    const presentation = buildCvPresentation(source, { name: "Sample Candidate", contact: "old@example.invalid" });
    expect(presentation.header).toEqual({ name: "Sample Candidate", contactLines: ["new@example.invalid"] });
    expect(presentation.blocks).toEqual([
      { kind: "section", title: "PROFILE" }, { kind: "paragraph", text: "Engineering leader." },
    ]);
  });

  it("keeps official-title context when explicit dates precede an extra metadata field", () => {
    const source = baseline("Example | Engineering Delivery Lead\nLondon / Remote | Jul 2024 - Jul 2026 | Official title: Senior Project Manager\n• Led delivery.");
    expect(buildCvPresentation(source).blocks).toEqual([{
      kind: "experience", company: "Example", role: "Engineering Delivery Lead",
      location: "London / Remote", dates: "Jul 2024 - Jul 2026",
      items: [
        { kind: "paragraph", text: "Official title: Senior Project Manager" },
        { kind: "bullet", text: "Led delivery." },
      ],
    }]);
  });

  it("preserves distinct roles, explicit locations and unknown text across entry boundaries", () => {
    const source = baseline("EXPERIENCE\nAlpha | Engineer\n\nTallinn | 2018–2020\n• Built an API.\n\nBeta | Lead\n\n2015–2018\nA narrative describing earlier work.\n\nUnclassified additional context.");
    const split = source.entries[0].text.indexOf("Tallinn");
    const entries = split > 0
      ? [{ ...source.entries[0], text: source.entries[0].text.slice(0, split) }, { ...source.entries[0], id: "continuation", text: source.entries[0].text.slice(split) }, ...source.entries.slice(1)]
      : source.entries;
    const blocks = buildCvPresentation({ ...source, entries }).blocks;
    expect(blocks).toEqual([
      { kind: "section", title: "EXPERIENCE" },
      { kind: "experience", company: "Alpha", role: "Engineer", location: "Tallinn", dates: "2018–2020", items: [{ kind: "bullet", text: "Built an API." }] },
      { kind: "experience", company: "Beta", role: "Lead", dates: "2015–2018", items: [
        { kind: "paragraph", text: "A narrative describing earlier work." },
        { kind: "paragraph", text: "Unclassified additional context." },
      ] },
    ]);
  });

  it("retains undelimited and date-like narrative content rather than guessing employer fields", () => {
    expect(buildCvPresentation(baseline("A role without explicit metadata\nWorked with a team in 2021.\n\nA | B\nDelivered a project in 2022.\n\n-Long-term work remains text.")).blocks).toEqual([
      { kind: "paragraph", text: "A role without explicit metadata Worked with a team in 2021." },
      { kind: "paragraph", text: "A | B Delivered a project in 2022." },
      { kind: "paragraph", text: "-Long-term work remains text." },
    ]);
  });
  it("uses authoritative profile edits and clears without rewriting the original header", () => {
    const source = baseline("Original Candidate\nold@example.invalid\nLONDON\n\nExample | Engineer | 2018–2024\nDelivered services.");
    const original = JSON.stringify(source);
    const override = {
      sourceNames: ["Original Candidate"], sourceContactValues: ["old@example.invalid", "LONDON"],
      name: "Current Candidate", contact: "new@example.invalid", location: "Amsterdam",
    };
    const edited = buildCvPresentation(source, {}, override);
    expect(edited.header).toEqual({ name: "Current Candidate", contactLines: ["new@example.invalid", "Amsterdam"] });
    expect(JSON.stringify(edited.blocks)).not.toMatch(/Original Candidate|old@example|LONDON/);
    expect(edited.blocks[0]).toMatchObject({ kind: "experience", company: "Example", role: "Engineer", dates: "2018–2024" });
    expect(buildCvPresentation(source, {}, { ...override, name: null, contact: null, location: null }).header).toEqual({ contactLines: [] });
    expect(JSON.stringify(source)).toBe(original);
  });

  it("never removes an arbitrary leading paragraph to make room for an authoritative header", () => {
    const source = baseline("I deliver reliable systems and coach engineering teams.\n\nExample | Engineer | 2018–2024\nDelivered services.");
    const result = buildCvPresentation(source, {}, {
      sourceNames: ["Original Candidate"], sourceContactValues: ["old@example.invalid"],
      name: "Current Candidate", contact: null, location: null,
    });
    expect(result.blocks[0]).toEqual({ kind: "paragraph", text: "I deliver reliable systems and coach engineering teams." });
    expect(result.blocks[1]).toMatchObject({ kind: "experience", company: "Example" });
  });

  it("handles separately spaced source contact lines without consuming career history", () => {
    const source = baseline("Original Candidate\n\nold@example.invalid\n\nLONDON\n\nExample | Engineer | 2018–2024\nDelivered services.");
    const result = buildCvPresentation(source, {}, {
      sourceNames: ["Original Candidate"], sourceContactValues: ["old@example.invalid", "LONDON"],
      name: null, contact: null, location: null,
    });
    expect(result.header).toEqual({ contactLines: [] });
    expect(result.blocks[0]).toMatchObject({ kind: "experience", company: "Example" });
  });

  it("distinguishes untouched contact fields from explicit clears", () => {
    const source = baseline("Original Candidate\nold@example.invalid\n\nExample | Engineer | 2018–2024\nDelivered services.");
    const override = { sourceNames: ["Original Candidate"], sourceContactValues: [], name: "Original Candidate", contact: null };
    expect(buildCvPresentation(source, {}, { ...override, untouchedContactKinds: ["email"] }).header.contactLines).toEqual(["old@example.invalid"]);
    expect(buildCvPresentation(source, {}, override).header.contactLines).toEqual([]);
  });
  it("honours explicit long Markdown sections without inferring metadata from their delimiters", () => {
    const title = "Selected engineering projects | customer delivery and distributed operational infrastructure experience over multiple regions since 2020";
    const source = baseline(`## ${title}\n• Delivered infrastructure.\n\nExample | Principal Engineer | Berlin | 2018–2024\n• Led platform delivery.`);
    const original = JSON.stringify(source);
    expect(buildCvPresentation(source).blocks).toEqual([
      { kind: "section", title },
      { kind: "bullet", text: "Delivered infrastructure." },
      {
        kind: "experience", company: "Example", role: "Principal Engineer", location: "Berlin", dates: "2018–2024",
        items: [{ kind: "bullet", text: "Led platform delivery." }],
      },
    ]);
    expect(JSON.stringify(source)).toBe(original);
  });

  it("does not absorb a one-line authored role into the contact header", () => {
    const result = buildCvPresentation(baseline("Casey\ncontact@example.invalid\nExample | Engineer | 2020–2024\n• Delivered services."), { name: "Casey" });
    expect(result.header).toEqual({ name: "Casey", contactLines: ["contact@example.invalid"] });
    expect(result.blocks).toEqual([{
      kind: "experience", company: "Example", role: "Engineer", dates: "2020–2024",
      items: [{ kind: "bullet", text: "Delivered services." }],
    }]);
  });
});
