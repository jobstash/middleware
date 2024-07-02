export interface UserGithubOrganization {
  login: string;
  name: string;
  avatar_url: string;
  description: string;
  repositories: UserGithubRepository[];
}

export interface UserGithubRepository {
  name: string;
  description: string;
}
