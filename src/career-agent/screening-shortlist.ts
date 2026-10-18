export const SCREENING_SHORTLIST_VERSION = 3;

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map(entry => entry.trim()))]
  : [];
const words = (value: string): string[] => value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  .replace(/front[ -]?end/g, "frontend").replace(/back[ -]?end/g, "backend").replace(/full[ -]?stack/g, "fullstack")
  .match(/[a-z0-9+#]+/g) ?? [];
const normalized = (value: string): string => words(value).join("");
const generic: Record<string, true> = Object.fromEntries(["and", "or", "the", "a", "an", "of", "in", "for", "to", "with", "senior", "junior", "lead", "principal", "staff", "head", "chief", "director", "manager", "management", "engineer", "engineering", "developer", "development", "specialist", "professional", "role", "roles", "job", "jobs"].map(word => [word, true]));
const distinctive = (value: string): string[] => words(value).filter(word => !generic[word]);

type ParsedSource = {
  roleCategory?: string;
  preferences?: { jobCategories?: string[]; rolePriorities?: string[] };
  career?: { roles?: Array<{ title?: string; current?: boolean }> };
};
export type ShortlistSignals = { categories: string[]; roles: string[]; basis: string };

/** Only source-level extraction is reused; catalogue rows never invoke a model. */
export function shortlistSignals(context: { career?: { directions?: string[] }; job_categories?: string[]; role_priorities?: string[] }, parsed: ParsedSource | null, taxonomy: string[], goal?: string): ShortlistSignals {
  const map = (labels: string[], exactOnly = false): string[] => [...new Set(labels.flatMap(label => taxonomy.filter(category => {
    if (normalized(label) === normalized(category)) return true;
    if (exactOnly) return false;
    const allTerms = words(category);
    if (allTerms.length > 1 && allTerms.every(term => words(label).includes(term))) return true;
    const terms = distinctive(category);
    const available = new Set(distinctive(label));
    return terms.length > 0 && terms.every(term => available.has(term));
  })))];
  const selected = strings(context.career?.directions);
  const preferred = strings(context.job_categories);
  // An explicit career choice must never fall through to the candidate's old profession.
  if (selected.length || preferred.length) return {
    categories: map(selected.length ? selected : preferred, true), roles: [],
    basis: selected.length ? "selected_directions" : "preferred_categories",
  };
  const goalCategories = goal ? map([goal]) : [];
  if (goalCategories.length) return { categories: goalCategories, roles: [], basis: "search_goal" };
  const priorities = strings(context.role_priorities);
  if (priorities.length) return { categories: map(priorities), roles: priorities, basis: "preferred_roles" };
  const roles = strings([
    parsed?.roleCategory,
    ...(parsed?.preferences?.rolePriorities ?? []),
    ...(parsed?.career?.roles ?? []).filter(role => role.current).map(role => role.title),
  ]);
  const extractedCategories = map(strings(parsed?.preferences?.jobCategories), true);
  const categories = extractedCategories.length ? extractedCategories : map(roles);
  return { categories, roles, basis: "selected_cv_parse" };
}

