import { createHash } from "node:crypto";
import { getEncoding } from "js-tiktoken";

export interface RecommendationSentence {
  hash: string;
  textHash: string;
  source: string;
  text: string;
  weight: number;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const normalize = (text: string) =>
  text.normalize("NFKC").replace(/\s+/gu, " ").trim();
const weights: Record<string, number> = {
  requirements: 1,
  responsibilities: 1,
  experience: 1,
  preference: 1,
  past_experience: 0.65,
  description: 0.7,
  summary: 0.7,
  company: 0.7,
};
// Noise controls, not lexical relevance matching.
const boilerplate =
  /equal opportunity|regardless of (?:race|gender|religion)|privacy policy|cookie policy|all rights reserved|apply (?:now|here|by|via)|send (?:us )?your (?:cv|resume)|paid time off|dental insurance|health insurance|competitive (?:salary|compensation)|401\(?k\)?/iu;
const generic =
  /fast[- ]paced|dynamic (?:team|environment)|team player|communication skills|passion(?:ate)? for|make an impact|exciting opportunity|self[- ]motivated|work (?:well )?(?:independently|as part of a team)|highly motivated/iu;
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
let encoder: ReturnType<typeof getEncoding> | undefined;

export function recommendationSentences(
  content: string,
): RecommendationSentence[] {
  const blocks = JSON.parse(content) as {
    source: string;
    text?: string | null;
    context?: string | null;
  }[];
  const unique = new Map<string, RecommendationSentence>();
  for (const block of blocks) {
    if (!block.text || !weights[block.source]) continue;
    let text = block.text;
    if (text.startsWith("[")) {
      try {
        const items = JSON.parse(text);
        if (Array.isArray(items))
          text = items.filter(x => typeof x === "string").join("\n");
      } catch {
        /* ordinary prose */
      }
    }
    text = text
      .replace(/<(?:br|\/p|\/li|\/div|\/h[1-6])\b[^>]*>/giu, "\n")
      .replace(/<[^>]+>/gu, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .replace(/&nbsp;/gu, " ")
      .replace(/&amp;/gu, "&");
    for (const line of text.split(/\n+/u)) {
      const cleaned = line
        .replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/u, "")
        .trim();
      for (const part of segmenter.segment(cleaned)) {
        const sentence = normalize(part.segment);
        if (!sentence || boilerplate.test(sentence)) continue;
        const wordCount = sentence.split(/\s+/u).length;
        const specificity = generic.test(sentence)
          ? 0.1
          : wordCount < 3 && block.source !== "preference" && !block.context
            ? 0.3
            : 1;
        const context = block.context
          ? normalize(block.context).slice(0, 160)
          : "";
        const input = context ? `${context}: ${sentence}` : sentence;
        encoder ??= getEncoding("cl100k_base");
        if (encoder.encode(input).length > 8000)
          throw new Error("Sentence exceeds embedding token limit");
        const textHash = hash(sentence.toLocaleLowerCase("en"));
        const value = {
          hash: hash(input),
          textHash,
          source: block.source,
          text: input,
          weight: weights[block.source] * specificity,
        };
        if (
          !unique.has(textHash) ||
          unique.get(textHash)!.weight < value.weight
        )
          unique.set(textHash, value);
      }
    }
  }
  return [...unique.values()];
}
