import { createHash } from "node:crypto";

export const CANDIDATE_DOCUMENT_MAX_PAGES = 5;

export interface CandidateHiddenFragment {
  text: string;
  reason: "docx_vanish" | "pdf_nonpainting_text" | "pdf_zero_opacity" | "pdf_white_on_white_render";
  page: number | null;
  part: string;
}
export interface CandidateDocumentProvenance {
  version: 1;
  source_hash: string;
  source_text_hash: string;
  method: "pdf_operators" | "docx_run_properties" | "flattened_text";
  visibility: "partial" | "unknown";
  hidden: CandidateHiddenFragment[];
  truncated: boolean;
  limitations: string;
}
const MAX_HIDDEN_TEXT = 32000;
export const MAX_HIDDEN_FRAGMENTS = 256;
const hashText = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
export function unknownDocumentProvenance(sourceHash: string, text: string): CandidateDocumentProvenance {
  return { version: 1, source_hash: sourceHash, source_text_hash: hashText(text),
    method: "flattened_text", visibility: "unknown", hidden: [], truncated: false,
    limitations: "Flattened text and OCR do not establish original text visibility." };
}
export function addHidden(provenance: CandidateDocumentProvenance, fragment: CandidateHiddenFragment): void {
  if (!fragment.text.trim()) return;
  const remaining = MAX_HIDDEN_TEXT - provenance.hidden.reduce((sum, item) => sum + item.text.length, 0);
  if (provenance.hidden.length >= MAX_HIDDEN_FRAGMENTS || remaining <= 0) {
    provenance.truncated = true;
    return;
  }
  if (fragment.text.length > remaining) provenance.truncated = true;
  provenance.hidden.push({ ...fragment, text: fragment.text.slice(0, remaining) });
}
export interface CandidateScreeningSource {
  candidate_cv: string;
  hidden_context: string;
  provenance_hash: string;
}
/** Source custody stays unchanged; this projection is only for isolated model inputs. */
export function candidateScreeningSource(document: {
  source_text: string | null; content_hash: string; extraction_provenance?: unknown;
}): CandidateScreeningSource {
  const text = document.source_text ?? "";
  let provenance = unknownDocumentProvenance(document.content_hash, text);
  const raw = document.extraction_provenance;
  if (raw && typeof raw === "object") {
    const value = raw as CandidateDocumentProvenance;
    if (value.version === 1 && value.source_hash === document.content_hash &&
        value.source_text_hash === hashText(text) &&
        ["pdf_operators", "docx_run_properties", "flattened_text"].includes(value.method) &&
        ["partial", "unknown"].includes(value.visibility) && typeof value.truncated === "boolean" &&
        typeof value.limitations === "string" && value.limitations.length <= 2000 &&
        Array.isArray(value.hidden) && value.hidden.length <= MAX_HIDDEN_FRAGMENTS &&
        value.hidden.every(item => item && typeof item.text === "string" &&
          ["docx_vanish", "pdf_nonpainting_text", "pdf_zero_opacity", "pdf_white_on_white_render"].includes(item.reason) &&
          (item.page === null || Number.isSafeInteger(item.page) && item.page > 0 && item.page <= CANDIDATE_DOCUMENT_MAX_PAGES) &&
          typeof item.part === "string" && item.part.length <= 512) &&
        value.hidden.reduce((sum, item) => sum + item.text.length, 0) <= MAX_HIDDEN_TEXT) {
      provenance = { version: 1, source_hash: value.source_hash, source_text_hash: value.source_text_hash,
        method: value.method, visibility: value.visibility, hidden: value.hidden.map(item => ({
          text: item.text, reason: item.reason, page: item.page, part: item.part,
        })), truncated: value.truncated, limitations: value.limitations };
    }
  }
  // Match against immutable source, not previously redacted output: nested or
  // partially overlapping fragments must not erase each other's later matches.
  // Repeated visible occurrences are conservatively separated too. A difference
  // array merges overlapping intervals without allocating one object per match.
  let candidate_cv = text;
  let unmatched = false;
  if (provenance.truncated) {
    candidate_cv = "";
    provenance.limitations += " Ordinary evidence is withheld because the bounded hidden-fragment metadata is incomplete; the original source is preserved.";
  } else if (provenance.hidden.length) {
    const boundaries = new Int32Array(text.length + 1);
    for (const fragment of provenance.hidden) {
      if (!fragment.text) continue;
      let found = false;
      for (let start = text.indexOf(fragment.text); start !== -1; start = text.indexOf(fragment.text, start + 1)) {
        found = true;
        boundaries[start]++;
        boundaries[start + fragment.text.length]--;
      }
      if (!found) unmatched = true;
    }
    if (unmatched) {
      candidate_cv = "";
      provenance.limitations += " Ordinary evidence is withheld because a recorded hidden fragment cannot be located exactly in the preserved extraction; its original bytes and metadata are retained.";
    } else {
      const parts: string[] = [];
      let coverage = 0, cursor = 0;
      for (let index = 0; index <= text.length; index++) {
        const next = coverage + boundaries[index];
        if (coverage === 0 && next > 0) parts.push(text.slice(cursor, index), "\n");
        if (coverage > 0 && next === 0) cursor = index;
        coverage = next;
      }
      parts.push(text.slice(cursor));
      candidate_cv = parts.join("");
    }
  }
  const hidden_context = JSON.stringify(provenance);
  return { candidate_cv, hidden_context, provenance_hash: hashText(hidden_context) };
}
