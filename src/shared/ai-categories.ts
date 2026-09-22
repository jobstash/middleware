export const AI_CATEGORY_LABELS = {
  "frontier-labs": "Frontier",
  "neo-labs": "Neo-labs",
  "world-models": "World models",
  "agent-platforms": "Agents",
  "inference-model-serving": "Inference",
  neoclouds: "Neoclouds",
  chips: "Chips",
  "physical-ai": "Physical AI",
  "ai-for-science": "AI for science",
  applications: "Applications",
  "research-organizations": "Research orgs",
  "policy-and-strategy": "Policy",
  "science-and-progress": "Science policy",
  "funders-and-institutions": "Funders",
} as const;
export type AiCategory = keyof typeof AI_CATEGORY_LABELS;
export const AI_CATEGORIES = Object.keys(AI_CATEGORY_LABELS) as AiCategory[];

export function aiCategories(
  primary: unknown,
  additional: unknown,
): {
  aiPrimaryCategory: AiCategory | null;
  aiCategories: AiCategory[];
} {
  const values = [
    primary,
    ...(Array.isArray(additional) ? additional : []),
  ].filter(value => value !== null && value !== undefined);
  for (const value of values) {
    if (
      typeof value !== "string" ||
      !AI_CATEGORIES.includes(value as AiCategory)
    ) {
      throw new Error(`Unknown AI category: ${String(value)}`);
    }
  }
  return {
    aiPrimaryCategory: (primary as AiCategory) ?? null,
    aiCategories: [...new Set(values as AiCategory[])].sort(),
  };
}
