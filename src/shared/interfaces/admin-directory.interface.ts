export type AdminOrganizationDirectoryItem = {
  id?: string;
  orgId: string;
  name?: string;
  normalizedName?: string;
  location?: string;
  logoUrl?: string;
  summary?: string;
  projectCount: number;
};

export type AdminProjectDirectoryItem = {
  id: string;
  name?: string;
  normalizedName?: string;
  logoUrl?: string;
  category?: string;
  website?: string;
  orgIds: string[];
};

export type AdminDirectoryPage<T> = {
  data: T[];
  total: number;
};
