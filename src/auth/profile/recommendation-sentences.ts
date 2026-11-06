import { createHash } from "node:crypto";
import { getEncoding } from "js-tiktoken";
import { proseLinkLabels, replaceProseTags } from "./recommendation-markup";

export interface RecommendationSentence {
  hash: string;
  textHash: string;
  source: string;
  text: string;
  weight: number;
}
const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");
const normalize = (text: string): string =>
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
const boilerplate = [
  /equal opportunity|regardless of (?:race|gender|religion)|privacy policy|cookie policy|all rights reserved/iu,
  /apply (?:now|here|by|via)|send (?:us )?your (?:cv|resume)/iu,
  /paid time off|dental insurance|health insurance|competitive (?:salary|compensation)|401\(?k\)?/iu,
];
const generic =
  /fast[- ]paced|dynamic (?:team|environment)|team player|communication skills|passion(?:ate)? for|make an impact|exciting opportunity|self[- ]motivated|work (?:well )?(?:independently|as part of a team)|highly motivated/iu;
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
let encoder: ReturnType<typeof getEncoding> | undefined;

interface RecommendationBlock {
  source: string;
  text?: string | null;
  context?: string | null;
}

function blockProse(text: string): string {
  if (text.startsWith("[")) {
    try {
      const items = JSON.parse(text);
      if (Array.isArray(items))
        text = items.filter(x => typeof x === "string").join("\n");
    } catch {
      /* ordinary prose */
    }
  }
  text = replaceProseTags(text, prefix =>
    /^(?:br|\/p|\/li|\/div|\/h[1-6])\b/iu.test(prefix) ? "\n" : null,
  );
  text = replaceProseTags(text, () => " ");
  return proseLinkLabels(text)
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

function sentenceSpecificity(
  sentence: string,
  block: RecommendationBlock,
): number {
  if (generic.test(sentence)) return 0.1;
  if (
    sentence.split(/\s+/u).length < 3 &&
    block.source !== "preference" &&
    !block.context
  )
    return 0.3;
  return 1;
}

function weightedSentence(
  sentence: string,
  block: RecommendationBlock,
): RecommendationSentence {
  const specificity = sentenceSpecificity(sentence, block);
  const context = block.context ? normalize(block.context).slice(0, 160) : "";
  const input = context ? `${context}: ${sentence}` : sentence;
  encoder ??= getEncoding("cl100k_base");
  if (encoder.encode(input).length > 8000)
    throw new Error("Sentence exceeds embedding token limit");
  return {
    hash: hash(input),
    textHash: hash(sentence.toLocaleLowerCase("en")),
    source: block.source,
    text: input,
    weight: weights[block.source] * specificity,
  };
}

function appendBlockSentences(
  block: RecommendationBlock,
  unique: Map<string, RecommendationSentence>,
): void {
  if (!block.text || !weights[block.source]) return;
  for (const line of blockProse(block.text).split(/\n+/u)) {
    const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/u, "").trim();
    for (const part of segmenter.segment(cleaned)) {
      const sentence = normalize(part.segment);
      if (!sentence || boilerplate.some(pattern => pattern.test(sentence)))
        continue;
      const value = weightedSentence(sentence, block);
      const previous = unique.get(value.textHash);
      if (!previous || previous.weight < value.weight)
        unique.set(value.textHash, value);
    }
  }
}

export function recommendationSentences(
  content: string,
): RecommendationSentence[] {
  const blocks = JSON.parse(content) as RecommendationBlock[];
  const unique = new Map<string, RecommendationSentence>();
  for (const block of blocks) appendBlockSentences(block, unique);
  return [...unique.values()];
}
