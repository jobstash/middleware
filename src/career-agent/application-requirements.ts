const plain = (text: string): string =>
  text
    .replace(/<\/(?:li|p|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
/** Keep explicit requirement rows intact; arrays must not become comma-joined prose. */
export function applicationRequirements(
  job: Record<string, unknown>,
): string[] {
  const explicit = Array.isArray(job.requirements)
    ? job.requirements.filter((r): r is string => typeof r === "string")
    : typeof job.requirements === "string"
      ? [job.requirements]
      : [];
  const hasExplicit = explicit.some(r => r.trim());
  const source = hasExplicit
    ? explicit
    : [typeof job.description === "string" ? job.description : ""];
  const rows = source.flatMap(text => plain(text).split(/\n|(?<=[.!?])\s+/));
  let requirementSection = false;
  const requirements: string[] = [];
  for (const row of rows) {
    const text = row.trim();
    const heading = text.replace(/^[#*_\s]+|[#*_:\s]+$/g, "");
    if (
      /^(requirements?|qualifications?|responsibilities|what you(?:'ll| will) (?:do|bring)|what we(?:'re| are) looking for|who (?:you are|is this role for)|about (?:you|the role)|your (?:skills|experience|responsibilities)|nice to have|preferred qualifications)$/i.test(
        heading,
      )
    ) {
      requirementSection = true;
      continue;
    }
    if (
      /^(about (?:us|the company)|benefits|perks|compensation|why (?:join|work)|equal opportunity|how to apply)/i.test(
        heading,
      )
    ) {
      requirementSection = false;
      continue;
    }
    // Preserve source wording, but never treat navigation, markdown rules, company
    // boilerplate or headings as candidate requirements. Cap only after filtering.
    if (text.length < 12 || text.length > 1000 || !/[a-z]{3}/i.test(text))
      continue;
    if (
      /^(?:[*-]\s*)?\[[^\]]*\]\(https?:/i.test(text) ||
      /^https?:/i.test(text)
    )
      continue;
    if (/^(?:#{1,6}\s|\*\*[^*]+\*\*$)/.test(text)) continue;
    if (
      /research has shown|less likely.*apply|we would.*love to hear|list is indicative|manual work so you can|equal opportunity|regardless of (?:race|gender)|privacy policy|cookie policy/i.test(
        text,
      )
    )
      continue;
    const candidateLanguage =
      /\b(?:you (?:will|have|can|must|should|are)|experience (?:in|with|building|developing)|proficien(?:t|cy)|expertise|ability to|knowledge of|familiarity with|years? (?:of )?experience|must have|required|responsible for)\b/i.test(
        text,
      );
    if (hasExplicit || requirementSection || candidateLanguage)
      requirements.push(text);
  }
  return [...new Set(requirements)].slice(0, 40);
}
const stop = new Set(
  "the and with for your you our this that will have has are from into role team work working experience strong ability excellent skills required requirements candidate".split(
    " ",
  ),
);
export const requirementTerms = (text: string): Set<string> =>
  new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []).filter(
      term => !stop.has(term),
    ),
  );
