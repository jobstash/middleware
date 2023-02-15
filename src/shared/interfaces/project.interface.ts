export interface Project {
  id: string;

  defillamaId?: string;
  defillamaSlug?: string;

  name: string;
  description: string;
  url: string;
  logo: string;

  tokenAddress?: string;
  tokenSymbol?: string;

  isInConstruction: boolean;

  tvl?: number;
  monthlyVolume?: number;
  monthlyActiveUsers?: number;
  monthlyRevenue?: number;

  createdTimestamp: number;
  updatedTimestamp?: number;
}
