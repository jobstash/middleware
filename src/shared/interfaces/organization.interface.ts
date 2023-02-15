export interface Organization {
  id: string;
  orgId: string;
  name: string;
  description: string;
  location: string;
  url: string;

  githubOrganization: string;
  teamSize?: string;
  twitter?: string;
  discord?: string;
  linkedin?: string;
  telegram?: string;

  createdTimestamp: number;
  updatedTimestamp?: number;
}
