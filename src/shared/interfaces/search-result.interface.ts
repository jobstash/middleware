export interface SearchResult {
  grants: SearchResultPillar;
  grantsImpact: SearchResultPillar;
  organizations: SearchResultPillar;
  projects: SearchResultPillar;
  vcs: SearchResultPillar;
}

export type SearchNav = keyof SearchResult;

export interface SearchResultPillar {
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
  altPillar: Pillar | null;
}
