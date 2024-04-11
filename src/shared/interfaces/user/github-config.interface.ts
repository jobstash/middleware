export type GithubDevConfig = {
  clientID: string;
  clientSecret: string;
  scope: string[];
};

export type GithubConfig = {
  dev: GithubDevConfig;
};
