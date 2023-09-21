export interface RepositoryProperties {
  id: number;
  nodeId?: string;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  fork: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  language: string;
  weeklyHistogram: string;
  dailyHistogram: string;
  totalCommits: number;
  lastSync: number;
}
