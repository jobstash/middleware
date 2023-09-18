export interface GithubLoginInput {
  githubAccessToken: string;
  githubRefreshToken: string;
  githubLogin: string;
  githubId: number;
  githubNodeId: string;
  githubGravatarId?: string | undefined;
  githubAvatarUrl: string;
  wallet: string;
  role: string;
}
