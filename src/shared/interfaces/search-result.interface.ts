export interface SearchResult {
  grants: SearchResultPillar;
  grantsImpact: SearchResultPillar;
  organizations: SearchResultPillar;
  projects: SearchResultPillar;
  vcs: SearchResultPillar;
}

export interface SearchResultPillar {
  names: SearchResultItem[];
  [x: string]: SearchResultItem[];
}

export interface SearchResultItem {
  value: string;
  link: string;
}
