import { Category } from "../enums";

export interface DefiLlamaProject {
  id: string;
  name: string;
  address: null | string;
  symbol: string;
  url: string;
  description: null | string;
  chain: string;
  logo: string;
  audits: null | string;
  auditNote?: null | string;
  geckoid: null | string;
  cmcId: null | string;
  category: Category;
  chains: string[];
  module: string;
  twitter?: null | string;
  slug: string;
  tvl: number;
  chainTvls: { [key: string]: number };
  change1H: number | null;
  change1D: number | null;
  change7D: number | null;
  fdv?: number;
  mcap?: number;
  referralUrl?: string;
  auditLinks?: string[];
  oracles?: string[];
  openSource?: boolean;
  language?: string;
  staking?: number;
  parentProtocol?: string;
  pool2?: number;
  listedAt?: number;
  forkedFrom?: string[];
}

export interface FeeOverview {
  totalDataChart?: unknown[];
  totalDataChartBreakdown?: unknown[];
  protocols?: Protocol[];
  allChains?: string[];
  total24h?: number;
  total7d?: number;
  total30d?: number;
  change_1d?: number | null;
  change_7d?: number | null;
  change_1m?: number | null;
  change_7dover7d?: number;
  change_30dover30d?: number;
  breakdown24h?: null;
  dailyRevenue?: number;
  dailyUserFees?: number;
  dailyHoldersRevenue?: number;
  dailyCreatorRevenue?: number;
  dailySupplySideRevenue?: number;
  dailyProtocolRevenue?: number;
  chains?: string[];
  disabled?: boolean;
  methodology?: unknown;
}

export interface Protocol {
  name: string;
  disabled: boolean;
  displayName: string;
  module: string;
  category: string;
  logo: string;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
  change_7dover7d: number;
  change_30dover30d: number;
  total24h: number;
  total7d: number;
  total30d: number;
  totalAllTime: number | null;
  breakdown24h: unknown;
  chains: string[];
  protocolsStats: ProtocolsStats | null;
  protocolType: "chain" | "protocol";
  methodologyURL: string;
  methodology: unknown | string;
  latestFetchIsOk: boolean;
  dailyRevenue: number;
  dailyUserFees?: number | null;
  dailyHoldersRevenue: number | null;
  dailyCreatorRevenue: number | null;
  dailySupplySideRevenue: number | null;
  dailyProtocolRevenue: number | null;
  dailyFees?: number;
}

export interface ProtocolsStats {
  v1?: FeeOverview;
  v2?: FeeOverview;
  classic?: Classic;
  elastic?: Classic;
  v3?: Classic;
  trident?: unknown;
  stableswap?: Classic;
  seaport?: unknown;
}

export interface Classic {
  chains: string[];
  disabled: boolean;
  methodology: unknown;
  total24h: number;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
  change_7dover7d: number;
  total7d: number;
  change_30dover30d: number;
  total30d: number;
  breakdown24h: null;
  dailyRevenue: number;
  dailyUserFees?: number;
  dailyHoldersRevenue: number | number;
  dailySupplySideRevenue?: number;
  dailyProtocolRevenue?: number | number;
}

export interface OptionsSummary {
  totalDataChart: unknown[];
  totalDataChartBreakdown: unknown[];
  protocols: Protocol[];
  allChains: string[];
  total24h: number;
  total7d: number;
  total30d: number;
  change_1d: number;
  change_7d: number;
  change_1m: number;
  change_7dover7d: number;
  change_30dover30d: number;
  breakdown24h: null;
  dailyPremiumVolume: number;
}

export interface DexSummary {
  totalDataChart: unknown[];
  totalDataChartBreakdown: unknown[];
  protocols: Protocol[];
  allChains: string[];
  total24h: number;
  total7d: number;
  total30d: number;
  change_1d: number;
  change_7d: number;
  change_1m: number;
  change_7dover7d: number;
  change_30dover30d: number;
  breakdown24h: null;
}
