/**
 * Funding round for organization
 */
export interface PillarFundingRound {
  id: string;
  date: number;
  roundName: string | null;
  raisedAmount: number | null;
}

/**
 * Investor for organization
 */
export interface PillarInvestor {
  id: string;
  name: string;
  normalizedName: string;
}

/**
 * Tag for job
 */
export interface PillarTag {
  id: string;
  name: string;
  normalizedName: string;
}

/**
 * Organization for job
 */
export interface PillarOrganization {
  id: string;
  name: string;
  normalizedName: string;
  orgId: string;
  website: string | null;
  summary: string;
  location: string;
  description: string;
  logoUrl: string | null;
  headcountEstimate: number | null;
  fundingRounds: PillarFundingRound[];
  investors: PillarInvestor[];
}

/**
 * Job representation for pillar pages matching frontend Zod schema
 */
export interface PillarJob {
  id: string;
  title: string | null;
  url: string | null;
  shortUUID: string;
  timestamp: number;
  summary: string | null;

  seniority: string | null;
  salary: number | null;
  minimumSalary: number | null;
  maximumSalary: number | null;
  location: string | null;
  locationType: string | null;
  commitment: string | null;
  paysInCrypto: boolean | null;
  offersTokenAllocation: boolean | null;
  salaryCurrency: string | null;
  classification: string | null;
  tags: PillarTag[];

  access: "public" | "protected";
  featured: boolean;
  featureStartDate: number | null;
  featureEndDate: number | null;
  onboardIntoWeb3: boolean;

  organization: PillarOrganization | null;
}

export interface SuggestedPillar {
  label: string;
  href: string;
}

/**
 * Response data for a pillar page
 */
export interface PillarPageData {
  title: string;
  description: string;
  jobs: PillarJob[];
  suggestedPillars: SuggestedPillar[];
}

/**
 * Parsed pillar slug information
 */
export interface ParsedPillarSlug {
  pillarType: string;
  value: string;
  prefix: string;
}
