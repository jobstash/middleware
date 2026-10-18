import type { CvDraftBaseline } from "./cv-source-baseline";

export interface CvTextBlock {
  kind: "paragraph" | "bullet";
  text: string;
}
export interface CvExperienceBlock {
  kind: "experience";
  company: string;
  role: string;
  location?: string;
  dates?: string;
  items: CvTextBlock[];
}
export type CvDocumentBlock = CvTextBlock | CvExperienceBlock | { kind: "section"; title: string };
export interface CvPresentation {
  header: { name?: string; contactLines: string[] };
  blocks: CvDocumentBlock[];
}

/** Explicit local profile values override only positively identified source headers. */
export interface CvHeaderOverride {
  sourceNames: string[];
  sourceContactValues: string[];
  /** Unfilled local fields are not explicit clears; retain their source values. */
  untouchedContactKinds?: Array<"email" | "phone" | "link">;
  name?: string | null;
  contact?: string | null;
  location?: string | null;
}

const sectionNames: Record<string, true> = {
  profile: true, summary: true, "professional summary": true, "executive summary": true,
  "professional profile": true, "professional experience": true, "work experience": true,
  employment: true, "employment history": true, experience: true, "career history": true,
  education: true, qualifications: true, qualification: true, certifications: true,
  skills: true, "technical skills": true, "core competencies": true, languages: true,
  technologies: true, "languages & technologies": true, "additional experience": true,
  projects: true, "selected projects": true, awards: true, interests: true,
  publications: true, volunteering: true,
};
const isSection = (text: string): boolean => /^#{1,6}\s+\S/.test(text) || (text.length <= 90 && (
  sectionNames[text.toLowerCase().replace(/:$/, "")] === true ||
  (/[A-Z]/.test(text) && text === text.toUpperCase() && !/[\d|@,•●▪◦]/.test(text))
));
const dateText = (text: string): boolean => /\b(?:19|20)\d{2}\b/.test(text);
const bulletMarker = /^(?:[•●▪◦‣]\s*|[-*]\s+)/;

/** Only explicit source delimiters create fields. All other text is retained. */
export function buildCvPresentation(
  baseline: CvDraftBaseline,
  heading: { name?: string; contact?: string; location?: string } = {},
  headerOverride?: CvHeaderOverride,
): CvPresentation {
  const rows = baseline.entries.flatMap(entry => entry.text.split(/\r\n|\r|\n|\f/).map(text => text.trim()));
  const presentation: CvPresentation = {
    header: {
      ...(heading.name?.trim() ? { name: heading.name.trim() } : {}),
      contactLines: [heading.contact, heading.location].filter((value): value is string => !!value?.trim()),
    },
    blocks: [],
  };
  let cursor = 0;
  while (cursor < rows.length && !rows[cursor]) cursor++;
  if (headerOverride) {
    const sourceName = headerOverride.sourceNames.some(name => name.trim() && (rows[cursor] ?? "").trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
    if (sourceName) cursor++;
    const retainedContacts: string[] = [];
    const contactValue = (value: string) => headerOverride.sourceContactValues.some(known => value.trim().toLocaleLowerCase() === known.trim().toLocaleLowerCase()) ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
      /^(?:https?:\/\/|www\.)\S+$/.test(value) ||
      /^\+?[\d ().-]{7,}$/.test(value);
    // Only exact attributed values or syntactically identifiable contacts are
    // suppressed. A section, job, summary, or arbitrary first paragraph stays.
    while (cursor < rows.length) {
      const row = rows[cursor];
      if (!row) { cursor++; continue; }
      const attributed = headerOverride.sourceContactValues.some(known => row.trim().toLocaleLowerCase() === known.trim().toLocaleLowerCase());
      if (!attributed && (dateText(row) || isSection(row) || bulletMarker.test(row))) break;
      const parts = row.split(/\s*[|•]\s*/);
      if (!parts.every(contactValue)) break;
      for (const part of parts) {
        const kind = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part) ? "email" :
          /^(?:https?:\/\/|www\.)\S+$/.test(part) ? "link" :
          /^\+?[\d ().-]{7,}$/.test(part) ? "phone" : undefined;
        if (kind && headerOverride.untouchedContactKinds?.includes(kind)) retainedContacts.push(part);
      }
      cursor++;
    }
    presentation.header = {
      ...(headerOverride.name?.trim() ? { name: headerOverride.name.trim() } : {}),
      contactLines: [...retainedContacts, headerOverride.contact, headerOverride.location].filter((value): value is string => !!value?.trim()),
    };
  } else if (heading.name && rows[cursor]?.toLowerCase() === heading.name.trim().toLowerCase()) {
    presentation.header = { name: rows[cursor++], contactLines: [] };
    while (cursor < rows.length) {
      const text = rows[cursor];
      if (!text) {
        cursor++;
        if (presentation.header.contactLines.length) break;
        continue;
      }
      if (text.length > 240 || isSection(text) || bulletMarker.test(text) ||
          (text.includes("|") && (dateText(text) || dateText(rows.slice(cursor + 1).find(row => !!row) ?? "")))) break;
      presentation.header.contactLines.push(text);
      cursor++;
      if (presentation.header.contactLines.length >= 6) break;
    }
  }
  let experience: CvExperienceBlock | undefined;
  let separated = true;
  for (; cursor < rows.length; cursor++) {
    const text = rows[cursor];
    if (!text) { separated = true; continue; }
    const parts = text.split(/\s*\|\s*/);
    let detailIndex = cursor + 1;
    while (detailIndex < rows.length && !rows[detailIndex]) detailIndex++;
    const detail = rows[detailIndex] ?? "";
    const detailParts = detail.split(/\s*\|\s*/);
    const followingDateIndex = detailParts.findIndex(dateText);
    const sameLineDates = parts.length >= 3 && dateText(parts[parts.length - 1]);
    const followingDates = parts.length >= 2 && !bulletMarker.test(text) &&
      followingDateIndex >= 0 && !bulletMarker.test(detail) &&
      (detailParts.length >= 2 ||
        !detail.replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|present|current|now|ongoing)\b/gi, "")
          .replace(/[\d\s./–—-]/g, ""));
    if (!bulletMarker.test(text) && !isSection(text) && (sameLineDates || followingDates)) {
      experience = {
        kind: "experience", company: parts[0], role: sameLineDates ? parts[1] : parts.slice(1).join(" | "),
        ...(sameLineDates
          ? { dates: parts[parts.length - 1], ...(parts.length > 3 ? { location: parts.slice(2, -1).join(" | ") } : {}) }
          : { dates: detailParts[followingDateIndex], ...(followingDateIndex > 0 ? { location: detailParts.slice(0, followingDateIndex).join(" | ") } : {}) }),
        items: followingDates && !sameLineDates
          ? detailParts.slice(followingDateIndex + 1).filter(Boolean).map(text => ({ kind: "paragraph" as const, text }))
          : [],
      };
      presentation.blocks.push(experience);
      if (followingDates && !sameLineDates) cursor = detailIndex;
      separated = true;
      continue;
    }
    if (isSection(text)) {
      presentation.blocks.push({ kind: "section", title: text.replace(/^#{1,6}\s+/, "") });
      experience = undefined;
      separated = true;
      continue;
    }
    const marker = bulletMarker.exec(text);
    const item: CvTextBlock = marker
      ? { kind: "bullet", text: text.slice(marker[0].length) }
      : { kind: "paragraph", text };
    const items = experience ? experience.items : presentation.blocks;
    const previous = items[items.length - 1];
    if (!marker && !separated && previous && (previous.kind === "paragraph" || previous.kind === "bullet"))
      previous.text += ` ${item.text}`;
    else items.push(item);
    separated = false;
  }
  return presentation;
}
