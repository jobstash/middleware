export interface SuggestionItem {
  id: string;
  label: string;
  href: string;
}

export interface GroupInfo {
  id: string;
  label: string;
}

export interface SuggestionsResponse {
  groups: GroupInfo[];
  activeGroup: string;
  items: SuggestionItem[];
  page: number;
  hasMore: boolean;
}
