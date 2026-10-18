import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { applyCvBaselineChanges, buildCvBaseline } from "./cv-source-baseline";
import { measureCareerCvLayout, renderCareerCvPdf } from "./career-pdf";
type ExtractedPdf = { text: string; pages: { text: string }[] };

// Like candidate-document-codec.spec.ts, run real PDF.js extraction in native
// Node: Jest's VM cannot import its worker without experimental VM flags.
// Batch fixtures to avoid starting one worker process per boundary position.
function extractPdfText(pdfs: Uint8Array[]): ExtractedPdf[] {
  const child = `
    const fs = require("node:fs");
    const { getPath } = require("pdf-parse/worker");
    const { PDFParse } = require("pdf-parse");
    PDFParse.setWorker(getPath());
    (async () => {
      const results = [];
      for (const input of JSON.parse(fs.readFileSync(0, "utf8"))) {
        const parser = new PDFParse({ data: Uint8Array.from(Buffer.from(input, "base64")) });
        try {
          const { text, pages } = await parser.getText();
          results.push({ text, pages: pages.map(({ text }) => ({ text })) });
        } finally { await parser.destroy(); }
      }
      process.stdout.write(JSON.stringify(results));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  return JSON.parse(execFileSync(process.execPath, ["-e", child], {
    cwd: resolve(__dirname, "../.."),
    input: JSON.stringify(pdfs.map(bytes => Buffer.from(bytes).toString("base64"))),
    encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "inherit"],
  }));
}

const baselineFor = (sourceText: string) => applyCvBaselineChanges(buildCvBaseline({
  id: "source", contentHash: "source-hash", sourceText,
}), []);

describe("CareerCup CV pagination", () => {
  it("keeps section, role identity, dates and the first achievement together across page boundaries", async () => {
    const rolePages = new Set<number>();
    const pdfs: Uint8Array[] = [];
    for (let count = 25; count <= 50; count++) {
      const text = ["Casey", "SUMMARY",
        ...Array.from({ length: count }, (_, i) => `• Completed earlier career milestone ${i + 1}.`),
        "EXPERIENCE", "Employer | Software engineer", "Remote | 2020 – Present", "● Built reliable customer integrations."].join("\n");
      const baseline = baselineFor(text);
      const bytes = await renderCareerCvPdf({ heading: { name: "Casey" }, baseline });
      const pdf = await PDFDocument.load(bytes);
      for (const page of pdf.getPages()) expect(page.getSize()).toEqual({ width: 595.28, height: 841.89 });
      pdfs.push(bytes);
      expect(baseline.entries.map(entry => entry.text).join("")).toBe(text);
    }
    const results = extractPdfText(pdfs);
    expect(results).toHaveLength(pdfs.length);
    for (const result of results) {
      const index = result.pages.findIndex(page => page.text.includes("Employer"));
      expect(index).toBeGreaterThanOrEqual(0);
      rolePages.add(index);
      expect(result.pages[index].text).toContain("EXPERIENCE");
      expect(result.pages[index].text).toContain("Software engineer");
      expect(result.pages[index].text).toContain("2020");
      expect(result.pages[index].text).toContain("Built reliable customer integrations.");
    }
    expect(rolePages).toEqual(new Set([0, 1]));
  });

  it("flows beyond two A4 pages at 11pt without losing or reordering achievements", async () => {
    const achievements = Array.from({ length: 170 }, (_, index) =>
      `Delivered milestone ${String(index + 1).padStart(3, "0")} for customer integrations and improved operational handovers.`);
    const source = ["Casey", "EXPERIENCE", "Employer | Staff Engineer | 2018 – Present",
      ...achievements.map(text => `• ${text}`), "EDUCATION", "Completed computer science studies."].join("\n");
    const baseline = baselineFor(source);
    const original = JSON.stringify(baseline);
    const input = { heading: { name: "Casey" }, baseline };
    const layout = await measureCareerCvLayout(input);
    expect(layout).toMatchObject({ fits: true, maxPages: null, fontSize: 11, paper: "A4" });
    expect(layout.pages).toBeGreaterThan(2);
    const bytes = await renderCareerCvPdf(input);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(layout.pages);
    const [result] = extractPdfText([bytes]);
    const text = result.text.replace(/\s+/g, " ");
    let previous = -1;
    for (const achievement of achievements) {
      const index = text.indexOf(achievement);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(text.indexOf("Completed computer science studies.")).toBeGreaterThan(previous);
    expect(result.pages.every(page => page.text.trim().length > 0)).toBe(true);
    expect(JSON.stringify(baseline)).toBe(original);
  });

  it("wraps long section and three-column role headings without dropping words or long tokens", async () => {
    const title = "Selected engineering experience in distributed platform delivery, customer infrastructure and international operational collaboration";
    const company = "International Research and Customer Infrastructure Engineering Organisation";
    const role = "Principal Engineer for Distributed Platforms and Operational Collaboration";
    const token = "longreference".repeat(90);
    const baseline = baselineFor([`## ${title}`, `${company} | ${role} | January 2018 – December 2024`,
      "• Delivered the opening achievement.", `• ${token}`, "• Preserved the final achievement."].join("\n"));
    const bytes = await renderCareerCvPdf({ heading: {}, baseline });
    const [result] = extractPdfText([bytes]);
    const text = result.text.replace(/\s+/g, " ");
    expect(text).toContain(title);
    // Extraction may interleave the three header columns by physical row.
    for (const word of `${company} ${role}`.split(" ")) expect(text).toContain(word);
    expect(result.pages[0].text).toContain("Delivered the opening achievement.");
    expect(text.replace(/\s/g, "")).toContain(token);
    expect(text).toContain("Preserved the final achievement.");
    expect(text).not.toContain("##");
  });

  it("allows a role heading taller than one page to flow instead of shrinking or rejecting it", async () => {
    const companyWords = Array.from({ length: 300 }, (_, index) => `Organisation${index}`);
    const bytes = await renderCareerCvPdf({
      heading: {},
      baseline: baselineFor(`EXPERIENCE\n${companyWords.join(" ")} | Engineer | 2020–2024\n• Preserved opening achievement.`),
    });
    const [result] = extractPdfText([bytes]);
    expect(result.pages.length).toBeGreaterThan(2);
    for (const word of companyWords) expect(result.text).toContain(word);
    const lastPage = result.pages[result.pages.length - 1].text;
    expect(lastPage).toContain(companyWords[companyWords.length - 1]);
    expect(lastPage).toContain("Preserved opening achievement.");
  });

  it("retains Unicode and applies explicit header replacements and clears to PDF text and metadata", async () => {
    const baseline = baselineFor("Original Candidate\nold@example.invalid\nLondon\n\nEXPERIENCE\nExample | Engineer | 2020–2024\n• Built systems with Łukasz and Олена in Zürich.");
    const headerOverride = {
      sourceNames: ["Original Candidate"], sourceContactValues: ["old@example.invalid", "London"],
      name: "Zoë Novák", contact: "current@example.invalid", location: "Prague",
    };
    for (const override of [headerOverride, { ...headerOverride, name: null, contact: null, location: null }]) {
      const bytes = await renderCareerCvPdf({ heading: { name: "Original Candidate" }, baseline, headerOverride: override });
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getTitle()).toBe(override.name ?? "Career CV");
      const [{ text }] = extractPdfText([bytes]);
      expect(text).toContain("Łukasz");
      expect(text).toContain("Олена");
      expect(text).toContain("Zürich");
      expect(text).not.toMatch(/Original Candidate|old@example.invalid|London/);
      if (override.name) {
        expect(text).toContain(override.name);
        expect(text).toContain("current@example.invalid");
      } else expect(text).not.toMatch(/Zoë|current@example.invalid|Prague/);
    }
  });
});
