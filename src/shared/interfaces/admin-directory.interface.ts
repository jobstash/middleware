export type AdminOrganizationDirectoryItem = {
  id?: string;
  orgId: string;
  name?: string;
  normalizedName?: string;
  location?: string;
  logoUrl?: string;
  summary?: string;
  vertical?: string;
  projectCount: number;
  banned: boolean;
};

export type AdminProjectDirectoryItem = {
  id: string;
  name?: string;
  normalizedName?: string;
  logoUrl?: string;
  category?: string;
  website?: string;
  orgIds: string[];
  banned: boolean;
};

export type AdminDirectoryPage<T> = {
  data: T[];
  total: number;
};
