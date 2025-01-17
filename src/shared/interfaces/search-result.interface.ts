export interface SearchResult {
  grants: SearchResultNav;
  grantsImpact: SearchResultNav;
  organizations: SearchResultNav;
  projects: SearchResultNav;
  vcs: SearchResultNav;
}

export type SearchNav = keyof SearchResult;

export interface SearchResultNav {
  names: SearchResultItem[];
  [x: string]: SearchResultItem[];
}

export interface SearchResultItem {
  value: string;
  link: string;
}

export interface Pillar {
  slug: string;
  items: string[];
}

export interface PillarInfo {
  title: string;
  description: string;
  activePillar: Pillar;
  altPillars: Pillar[];
}
