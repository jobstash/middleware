import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";

export interface CvBaselineSource {
  id: string;
  contentHash: string;
  sourceText: string;
}

export interface CvSourceBaseline {
  sourceDocumentId: string;
  /** Binds both the original document bytes and its exact current extracted text. */
  sourceHash: string;
  entries: Array<{ id: string; text: string }>;
}

export interface CvDraftBaseline {
  sourceDocumentId: string;
  sourceHash: string;
  entries: Array<{ id: string; original: string; text: string }>;
}

export interface CvBaselineChange {
  entryId: string;
  text: string;
}

/** Source chunks are text boundaries, never inferred roles or qualifications. */
export function buildCvBaseline(source: CvBaselineSource): CvSourceBaseline {
  if (!source.id || !source.contentHash || typeof source.sourceText !== "string" || !source.sourceText.trim())
    throw new BadRequestException("This CV needs readable source text before drafting");
  const sourceHash = createHash("sha256").update("cv-source-baseline-v1\0")
    .update(source.id).update("\0").update(source.contentHash).update("\0").update(source.sourceText).digest("hex");
  const ranges: Array<{ start: number; end: number }> = [];
  const breaks = /\r\n|\r|\n|\f/g;
  let chunkStart = 0, lineStart = 0, hasText = false;
  for (const boundary of source.sourceText.matchAll(breaks)) {
    const end = boundary.index! + boundary[0].length;
    const blankLine = !source.sourceText.slice(lineStart, boundary.index).trim();
    hasText ||= !blankLine;
    // Keep paragraphs together where possible. Long single-spaced extracts can
    // split at an existing line boundary; a long unbroken line stays intact.
    if (hasText && (blankLine || boundary[0] === "\f" || end - chunkStart >= 4000)) {
      ranges.push({ start: chunkStart, end });
      chunkStart = end;
      hasText = false;
    }
    lineStart = end;
  }
  if (chunkStart < source.sourceText.length) {
    if (ranges.length && !source.sourceText.slice(chunkStart).trim()) ranges[ranges.length - 1].end = source.sourceText.length;
    else ranges.push({ start: chunkStart, end: source.sourceText.length });
  }
  return {
    sourceDocumentId: source.id,
    sourceHash,
    entries: ranges.map(({ start, end }) => ({
      id: createHash("sha256").update(sourceHash).update(`:${start}:${end}`).digest("hex"),
      text: source.sourceText.slice(start, end),
    })),
  };
}

/** Rewrites cannot drop untouched career history or quietly reset earlier edits. */
export function applyCvBaselineChanges(
  baseline: CvSourceBaseline | CvDraftBaseline,
  changes: readonly CvBaselineChange[],
  order?: readonly string[],
): CvDraftBaseline {
  const sourceEntries: Array<CvSourceBaseline["entries"][number] | CvDraftBaseline["entries"][number]> = baseline.entries;
  const byId = new Map(sourceEntries.map(entry => [entry.id, entry] as const));
  if (!byId.size || byId.size !== baseline.entries.length)
    throw new BadRequestException("The CV source baseline is incomplete");
  const replacements = new Map<string, string>();
  for (const change of changes) {
    if (!byId.has(change.entryId) || replacements.has(change.entryId))
      throw new BadRequestException("Choose each current CV source entry at most once");
    if (typeof change.text !== "string" || !change.text.trim() || change.text.length > 20000 || change.text.includes("\0"))
      throw new BadRequestException("CV source rewrites must contain text and fit within 20000 characters");
    replacements.set(change.entryId, change.text);
  }
  if (order && (order.length !== byId.size || new Set(order).size !== byId.size || order.some(id => !byId.has(id))))
    throw new BadRequestException("CV source order must contain every current entry exactly once");
  const entries = (order ? order.map(id => byId.get(id)!) : sourceEntries).map(entry => ({
    id: entry.id,
    original: "original" in entry ? entry.original : entry.text,
    text: replacements.get(entry.id) ?? entry.text,
  }));
  return { sourceDocumentId: baseline.sourceDocumentId, sourceHash: baseline.sourceHash, entries };
}

/** Call with an owned current source before applying rewrites or exporting. */
export function assertCvBaselineCurrent(saved: CvDraftBaseline, source: CvBaselineSource): void {
  const current = buildCvBaseline(source);
  if (saved.sourceDocumentId !== current.sourceDocumentId || saved.sourceHash !== current.sourceHash)
    throw new ConflictException("The source CV changed; prepare the draft from its current source");
  const originals = new Map(current.entries.map(entry => [entry.id, entry.text]));
  if (saved.entries.length !== originals.size)
    throw new ConflictException("The draft is missing source CV context; prepare it again");
  for (const entry of saved.entries) {
    if (!originals.has(entry.id) || originals.get(entry.id) !== entry.original)
      throw new ConflictException("The draft source CV context changed; prepare it again");
    originals.delete(entry.id);
    if (typeof entry.text !== "string" || !entry.text.trim())
      throw new ConflictException("The draft contains an empty source entry; restore its career context");
  }
}
