export interface SkillSuggestionItem {
  id: string;
  name: string;
  normalizedName: string;
}

export interface SkillSuggestionsData {
  items: SkillSuggestionItem[];
  page: number;
  hasMore: boolean;
}
