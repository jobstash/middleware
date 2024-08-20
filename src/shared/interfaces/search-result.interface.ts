export interface SearchResult {
  projectCategories: SearchResultItem[];
  grants: SearchResultItem[];
  organizations: SearchResultItem[];
  projects: SearchResultItem[];
  skills: SearchResultItem[];
  investors: SearchResultItem[];
  fundingRounds: SearchResultItem[];
}

export interface SearchResultItem {
  value: string;
  link: string;
}
